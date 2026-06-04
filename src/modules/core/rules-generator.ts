import * as path from 'path';

import {
    BestPractice, CodeFeature, CursorRule, Module, RuleGenerationContext,
    TechStack
} from '../../types.js';
import { FileUtils } from '../../utils/file-utils.js';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { BestPracticeComparator } from '../generators/best-practice-comparator.js';
import { BestPracticeExtractor } from '../generators/best-practice-extractor.js';
import { BestPracticeWebSearcher } from '../integrations/best-practice-web-searcher.js';
import {
    findBestFrameworkMatch, FrameworkMatch
} from '../generators/framework-matcher.js';
import { RuleRequirementsAnalyzer } from '../generators/rule-requirements-analyzer.js';
import { SuggestionCollector } from '../generators/suggestion-collector.js';
import {
    findBestTechStackMatches, MultiCategoryMatch, TechStackMatch
} from '../generators/tech-stack-matcher.js';
import { buildRuleMetadata } from '../generators/rules/rule-metadata.js';
import { generateApiPatternsRule } from '../generators/rules/api-patterns-rule.js';
import {
  generateErrorHandlingRule,
  generatePracticeBasedErrorHandling,
  generateErrorHandlingGuidelines,
} from '../generators/rules/error-handling-rule.js';
import {
  generateUIUXRule,
  generateUIUXGuidelines,
} from '../generators/rules/ui-ux-rule.js';
import {
  featureExists,
  isFrontendProject,
  getLanguageGlobs,
  getRouteGlobs,
  generateVersionedTechStack,
  generateCommandsSection,
  generatePersona,
  generatePostCodingConstraint,
  getProjectName,
  sanitizeFileName,
  getRouterTypeDescription,
  getOrganizationDescription,
  getArchitecturePatternName,
  getModuleTypeName,
  getCategoryDisplayName,
  formatMissingPractices,
  detectTestFramework,
} from '../generators/rules/rule-helpers.js';
import {
  generateTestingRule,
  generateConditionalTestingRules,
} from '../generators/rules/testing-rule.js';
import {
  generateFrontendRoutingRule,
  generateBackendRoutingRule,
} from '../generators/rules/routing-rule.js';
import { generateArchitectureRule } from '../generators/rules/architecture-rule.js';
import {
  generateProjectStructureRule,
  generateFallbackProjectStructureRule,
} from '../generators/rules/structure-rule.js';
import { generateCodeStyleRule } from '../generators/rules/code-style-rule.js';
import { generateModuleOverviewRule } from '../generators/rules/module-rule.js';
import {
  generateStateManagementRule,
  detectMobXPattern,
} from '../generators/rules/state-management-rule.js';
import { generateCustomToolsRule } from '../generators/rules/custom-tools-rule.js';

/**
 * 规则生成引擎
 * 结合项目特征和最佳实践，生成 Cursor Rules
 */
export class RulesGenerator {
  private frameworkMatch: FrameworkMatch | null = null;
  private multiCategoryMatch: MultiCategoryMatch | null = null;
  private suggestionCollector: SuggestionCollector;
  private bestPracticeExtractor: BestPracticeExtractor;
  private bestPracticeComparator: BestPracticeComparator;
  private webSearcher: BestPracticeWebSearcher;
  private requirementsAnalyzer: RuleRequirementsAnalyzer;
  constructor() {
    this.suggestionCollector = new SuggestionCollector();
    this.bestPracticeExtractor = new BestPracticeExtractor();
    this.bestPracticeComparator = new BestPracticeComparator();
    this.webSearcher = new BestPracticeWebSearcher();
    this.requirementsAnalyzer = new RuleRequirementsAnalyzer();
  }

  /**
   * 获取框架匹配信息（用于输出显示）
   */
  getFrameworkMatch(): FrameworkMatch | null {
    return this.frameworkMatch;
  }

  /**
   * 获取多类别技术栈匹配信息（用于输出显示）
   */
  getMultiCategoryMatch(): MultiCategoryMatch | null {
    return this.multiCategoryMatch;
  }

  /**
   * 获取建议收集器（用于输出显示）
   */
  getSuggestionCollector(): SuggestionCollector {
    return this.suggestionCollector;
  }

  /**
   * 获取规则需求分析器（用于输出显示）
   */
  getRequirementsAnalyzer(): RuleRequirementsAnalyzer {
    return this.requirementsAnalyzer;
  }

  /**
   * 按来源分组规则需求
   */
  private groupRequirementsBySource(
    requirements: Array<{ detectedFrom: string }>
  ): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const req of requirements) {
      grouped[req.detectedFrom] = (grouped[req.detectedFrom] || 0) + 1;
    }
    return grouped;
  }

  async generate(
    context: RuleGenerationContext,
    webSearchResults?: Record<string, string>
  ): Promise<CursorRule[]> {
    const rules: CursorRule[] = [];

    // 清空建议收集器
    this.suggestionCollector.clear();

    // 置信度闸门：技术栈完全识别不出（无 primary / languages / frameworks）时，
    // 任何生成结果都只会是占位垃圾，直接拒绝生成并提示调用方核对项目路径。
    const ts = context.techStack;
    if (
      ts.primary.length === 0 &&
      ts.languages.length === 0 &&
      ts.frameworks.length === 0
    ) {
      throw new ValidationError(
        '未能从该项目识别出任何技术栈（语言/框架/主依赖均为空），已跳过规则生成。请确认传入的是有效的项目根目录。'
      );
    }

    // v1.4: 框架匹配 - 找到最相似的框架规则格式
    this.frameworkMatch = findBestFrameworkMatch(context.techStack);
    if (this.frameworkMatch) {
      logger.info("框架匹配成功", {
        framework: this.frameworkMatch.framework,
        similarity: Math.round(this.frameworkMatch.similarity * 100) + "%",
        format: this.frameworkMatch.format,
      });
    }

    // v1.6: 多类别技术栈匹配 - 支持所有类别的规则
    this.multiCategoryMatch = await findBestTechStackMatches(context.techStack);
    if (this.multiCategoryMatch && this.multiCategoryMatch.matches.length > 0) {
      logger.info("多类别技术栈匹配成功", {
        totalMatches: this.multiCategoryMatch.matches.length,
        categories: this.multiCategoryMatch.categories,
        primaryMatch: this.multiCategoryMatch.primaryMatch?.ruleName,
        primarySimilarity: this.multiCategoryMatch.primaryMatch
          ? Math.round(this.multiCategoryMatch.primaryMatch.similarity * 100) +
            "%"
          : "N/A",
      });
    }

    // v1.5: 提取和对比最佳实践
    let missingPractices: any[] = [];
    let ambiguousPractices: any[] = [];

    // 优先使用多类别匹配（如果可用）
    if (this.multiCategoryMatch && this.multiCategoryMatch.matches.length > 0) {
      try {
        const extractedPractices =
          await this.bestPracticeExtractor.extractFromMultiCategoryMatch(
            this.multiCategoryMatch,
            context.techStack
          );

        const comparison = await this.bestPracticeComparator.compare(
          extractedPractices,
          context
        );
        missingPractices = comparison.missingPractices;
        ambiguousPractices = comparison.ambiguousPractices;
        this.suggestionCollector.addAll(comparison.suggestions);

        logger.info("最佳实践对比完成（多类别）", {
          extracted: extractedPractices.length,
          missing: missingPractices.length,
          ambiguous: ambiguousPractices.length,
          suggestions: comparison.suggestions.length,
        });

        // v1.5: 识别项目使用但规则中没有的技术栈
        const missingTechStacks = this.identifyMissingTechStacks(
          context.techStack,
          this.multiCategoryMatch.primaryMatch
        );

        // 对于缺失的技术栈，尝试网络搜索最佳实践
        if (missingTechStacks.length > 0) {
          let webPractices: any[] = [];

          // 如果有网络搜索结果，解析它们
          if (webSearchResults && Object.keys(webSearchResults).length > 0) {
            for (const [tech, searchResult] of Object.entries(
              webSearchResults
            )) {
              if (missingTechStacks.includes(tech)) {
                const parsed = this.webSearcher.parseWebSearchResults(
                  searchResult,
                  [tech]
                );
                webPractices.push(...parsed);
              }
            }
          }

          if (webPractices.length > 0) {
            missingPractices.push(...webPractices);
            logger.info("网络搜索找到最佳实践", {
              techStacks: missingTechStacks,
              practices: webPractices.length,
            });
          } else {
            // 使用备用方案
            logger.debug("网络搜索无结果，使用备用方案");
            const fallbackPractices =
              this.getFallbackPractices(missingTechStacks);
            if (fallbackPractices.length > 0) {
              missingPractices.push(...fallbackPractices);
              logger.info("使用备用方案找到最佳实践", {
                practices: fallbackPractices.length,
              });
            }
          }
        }
      } catch (error) {
        logger.debug("多类别最佳实践提取失败，回退到框架匹配", { error });
        // 回退到旧的框架匹配方式
        if (this.frameworkMatch) {
          try {
            const extractedPractices =
              await this.bestPracticeExtractor.extractFromFrameworkMatch(
                this.frameworkMatch,
                context.techStack
              );

            const comparison = await this.bestPracticeComparator.compare(
              extractedPractices,
              context
            );
            missingPractices = comparison.missingPractices;
            ambiguousPractices = comparison.ambiguousPractices;
            this.suggestionCollector.addAll(comparison.suggestions);

            logger.info("最佳实践对比完成（框架匹配）", {
              extracted: extractedPractices.length,
              missing: missingPractices.length,
              ambiguous: ambiguousPractices.length,
              suggestions: comparison.suggestions.length,
            });
          } catch (error2) {
            logger.debug("框架匹配最佳实践提取失败", { error: error2 });
          }
        }
      }
    } else if (this.frameworkMatch) {
      // 回退到旧的框架匹配方式
      try {
        const extractedPractices =
          await this.bestPracticeExtractor.extractFromFrameworkMatch(
            this.frameworkMatch,
            context.techStack
          );

        const comparison = await this.bestPracticeComparator.compare(
          extractedPractices,
          context
        );
        missingPractices = comparison.missingPractices;
        ambiguousPractices = comparison.ambiguousPractices;
        this.suggestionCollector.addAll(comparison.suggestions);

        logger.info("最佳实践对比完成（框架匹配）", {
          extracted: extractedPractices.length,
          missing: missingPractices.length,
          ambiguous: ambiguousPractices.length,
          suggestions: comparison.suggestions.length,
        });
      } catch (error) {
        logger.debug("最佳实践提取失败", { error });
      }
    }

    // v1.7: 使用规则需求分析器决定生成哪些规则
    const requirements = this.requirementsAnalyzer.analyzeRequirements(context);
    logger.info("规则需求分析完成", {
      totalRequirements: requirements.length,
      bySource: this.groupRequirementsBySource(requirements),
    });

    // v1.3: 生成多个专注的规则文件（每个 < 500 行）

    // 1. 全局概述规则（必需，约 280 行）
    const globalRule = this.generateGlobalOverviewRule(context);
    rules.push(globalRule);

    // 2. 代码风格规则（必需，约 200 行）
    const codeStyleRule = generateCodeStyleRule(context, missingPractices);
    rules.push(codeStyleRule);

    // 3. 项目结构规则（v1.8 新增，必需，约 300 行）
    let projectStructureRule: CursorRule;
    try {
      projectStructureRule = await generateProjectStructureRule(context);
    } catch (error) {
      logger.error("生成项目结构规则失败，使用简化版本", error);
      // 生成一个最小化的项目结构规则，确保文件总是被创建
      projectStructureRule = generateFallbackProjectStructureRule(context);
    }
    rules.push(projectStructureRule);

    // 4. 项目架构规则（必需，约 200 行，已移除结构相关内容）
    const architectureRule = generateArchitectureRule(
      context,
      missingPractices
    );
    rules.push(architectureRule);

    // 5. 自定义工具规则（按需，约 150 行）
    if (this.hasCustomTools(context)) {
      const customToolsRule = generateCustomToolsRule(context);
      rules.push(customToolsRule);
    }

    // 6. 错误处理规则（按需，约 180 行）
    if (this.hasErrorHandling(context)) {
      const errorHandlingRule = generateErrorHandlingRule(
        context,
        missingPractices
      );
      rules.push(errorHandlingRule);
    }

    // 7. 状态管理规则（按需，约 200 行）
    // v1.7: 基于需求分析器结果或原有检测逻辑
    const needsStateManagement =
      requirements.some((r) => r.ruleType === "state-management") ||
      this.hasStateManagement(context);
    if (needsStateManagement) {
      const stateManagementRule = await generateStateManagementRule(context);
      rules.push(stateManagementRule);
    }

    // 8. UI/UX 规则（按需，约 250 行）
    const needsUIUX =
      requirements.some((r) => r.ruleType === "ui-ux") ||
      isFrontendProject(context);
    if (needsUIUX) {
      const uiUxRule = generateUIUXRule(context);
      rules.push(uiUxRule);
    }

    // 9. 前端路由规则（按需，约 300 行）
    // v1.7: 基于需求分析器结果，即使没有路由文件，只要有依赖就生成
    const needsFrontendRouting = requirements.some(
      (r) => r.ruleType === "frontend-routing"
    );
    if (needsFrontendRouting) {
      // 如果没有检测到路由信息，创建一个基础的路由信息
      if (!context.frontendRouter) {
        // 从需求分析中获取路由框架信息
        const routingReq = requirements.find(
          (r) => r.ruleType === "frontend-routing"
        );
        if (
          routingReq &&
          routingReq.dependencies &&
          routingReq.dependencies.length > 0
        ) {
          // 根据依赖推断路由框架
          const depName = routingReq.dependencies[0].toLowerCase();
          let inferredFramework = "React Router";
          let inferredType: "file-based" | "config-based" = "config-based";
          let inferredLocation = ["src/"];

          if (depName.includes("next")) {
            inferredFramework = "Next.js";
            inferredType = "file-based";
            inferredLocation = ["app/"];
          } else if (depName.includes("nuxt")) {
            inferredFramework = "Nuxt";
            inferredType = "file-based";
            inferredLocation = ["pages/"];
          } else if (depName.includes("remix")) {
            inferredFramework = "Remix";
            inferredType = "file-based";
            inferredLocation = ["app/routes/"];
          } else if (depName.includes("sveltekit")) {
            inferredFramework = "SvelteKit";
            inferredType = "file-based";
            inferredLocation = ["src/routes/"];
          } else if (depName.includes("vue-router")) {
            inferredFramework = "Vue Router";
            inferredType = "config-based";
            inferredLocation = ["src/"];
          }

          // 创建基础的路由信息
          context.frontendRouter = {
            info: {
              exists: true,
              type: inferredType,
              framework: inferredFramework,
              location: inferredLocation,
            },
            pattern: {
              organization: "mixed",
              urlNaming: "kebab-case",
              fileNaming: "page.tsx",
              dynamicRoutePattern: "[id]",
              dynamicRouteExamples: [],
              hasRouteGroups: false,
              supportsLayouts: true,
              hasGuards: false,
              usesLazyLoading: false,
              hasRouteMeta: false,
              isDynamicGenerated: false,
            },
            examples: [],
          };
        }
      }

      if (context.frontendRouter) {
        const frontendRoutingRule = generateFrontendRoutingRule(context);
        rules.push(frontendRoutingRule);
      }
    }

    // 10. 后端路由规则（按需，约 300 行）
    // 纯前端项目（无后端框架依赖且无 backendRouter 检测结果）不生成
    // 使用精确名称匹配，避免 "originjs" 误命中 "gin" 等子字符串
    const backendFrameworkMatchers: Array<(name: string) => boolean> = [
      (n) => n === "express" || n.startsWith("express/") || n.startsWith("express-"),
      (n) => n === "fastify" || n.startsWith("fastify/") || n.startsWith("fastify-"),
      (n) => n === "koa" || n.startsWith("koa/") || n.startsWith("koa-"),
      (n) => n === "hapi" || n === "@hapi/hapi" || n.startsWith("@hapi/"),
      (n) => n === "nestjs" || n === "@nestjs/core" || n.startsWith("@nestjs/"),
      (n) => n === "django" || n === "flask" || n === "gin",
      (n) => n === "spring-boot" || n.startsWith("spring-"),
    ];
    const hasBackendDeps = context.techStack.dependencies.some((d) => {
      const name = d.name.toLowerCase();
      return backendFrameworkMatchers.some((match) => match(name));
    });
    const needsBackendRouting = requirements.some(
      (r) => r.ruleType === "backend-routing"
    ) && (hasBackendDeps || !!context.backendRouter);
    if (needsBackendRouting) {
      // 如果没有检测到路由信息，创建一个基础的路由信息
      if (!context.backendRouter) {
        // 从需求分析中获取路由框架信息
        const routingReq = requirements.find(
          (r) => r.ruleType === "backend-routing"
        );
        if (
          routingReq &&
          routingReq.dependencies &&
          routingReq.dependencies.length > 0
        ) {
          // 根据依赖推断路由框架
          const depName = routingReq.dependencies[0].toLowerCase();
          let inferredFramework = "Express";
          let inferredType: "file-based" | "config-based" | "programmatic" =
            "programmatic";
          let inferredLocation = ["src/routes/", "src/api/"];

          if (depName.includes("fastify")) {
            inferredFramework = "Fastify";
          } else if (depName.includes("koa")) {
            inferredFramework = "Koa";
          } else if (depName.includes("nestjs")) {
            inferredFramework = "NestJS";
            inferredLocation = ["src/"];
          } else if (depName.includes("django")) {
            inferredFramework = "Django";
            inferredType = "config-based";
            inferredLocation = [""];
          } else if (depName.includes("flask")) {
            inferredFramework = "Flask";
            inferredLocation = ["app/"];
          }

          // 创建基础的路由信息
          context.backendRouter = {
            info: {
              exists: true,
              type: inferredType,
              framework: inferredFramework,
              location: inferredLocation,
            },
            pattern: {
              organization: "mixed",
              urlNaming: "kebab-case",
              fileNaming: "route.ts",
              dynamicRoutePattern: ":id",
              dynamicRouteExamples: [],
              hasRouteGroups: false,
              supportsLayouts: false,
              hasGuards: false,
              usesLazyLoading: false,
              hasRouteMeta: false,
              isDynamicGenerated: false,
            },
            examples: [],
          };
        }
      }

      if (context.backendRouter) {
        const backendRoutingRule = generateBackendRoutingRule(context);
        rules.push(backendRoutingRule);
      }
    }

    // 11. 测试规则：仅在有测试框架或显式测试需求时生成（无框架 = 跳过，不生成空文件）
    const needsTesting = requirements.some((r) => r.ruleType === "testing");
    const hasTestingFeature = featureExists(context, "testing");
    const hasTestFramework = detectTestFramework(context) !== null;
    const isFrontend = isFrontendProject(context);
    if (needsTesting || hasTestingFeature || hasTestFramework) {
      const testingRule = generateTestingRule(context);
      rules.push(testingRule);
    }

    // 11b. API Patterns（前端项目有 axios 或自定义 apiClient 时生成）
    const hasApiClient = context.customPatterns?.apiClient?.exists;
    const hasAxiosDep = context.techStack.dependencies.some((d) => d.name === "axios");
    if (isFrontend && (hasApiClient || hasAxiosDep)) {
      const apiPatternsRule = generateApiPatternsRule(context);
      rules.push(apiPatternsRule);
    }

    // 11c. Feature Recipe（端到端功能创建模板，前端项目必生成）
    if (isFrontend) {
      const featureRecipeRule = await this.generateFeatureRecipeRule(context);
      rules.push(featureRecipeRule);
    }

    // 12. 模块规则（如果是多模块项目）
    if (context.includeModuleRules && context.modules.length > 1) {
      for (const module of context.modules) {
        try {
        const moduleRule = await generateModuleOverviewRule(context, module);
        rules.push(moduleRule);
        } catch (error) {
          logger.error(`生成模块规则失败: ${module.name}`, error);
          // 继续处理下一个模块，不中断整个流程
        }
      }
    }

    return rules;
  }

  /**
   * 检查是否有自定义工具
   */
  private hasCustomTools(context: RuleGenerationContext): boolean {
    if (!context.customPatterns) return false;
    return (
      context.customPatterns.customHooks.length > 0 ||
      context.customPatterns.customUtils.length > 0 ||
      Boolean(context.customPatterns.apiClient?.exists)
    );
  }

  /**
   * 检查是否有错误处理
   */
  private hasErrorHandling(context: RuleGenerationContext): boolean {
    const errorHandling = context.projectPractice?.errorHandling;
    if (!errorHandling) return false;
    return errorHandling.frequency > 0;
  }

  /**
   * 检查是否有状态管理
   */
  private hasStateManagement(context: RuleGenerationContext): boolean {
    return featureExists(context, "state-management");
  }

  /**
   * v1.3: 生成全局概述规则（约 280 行）
   */
  private generateGlobalOverviewRule(
    context: RuleGenerationContext
  ): CursorRule {
    const metadata = buildRuleMetadata(
      `${getProjectName(context.projectPath)} - 全局规则`,
      "Project-wide conventions, tech stack, and core development principles. Always loaded.",
      100,
      context.techStack.primary,
      ["global", "overview"],
      "overview",
      undefined,
      { alwaysApply: true }
    );

    const persona = generatePersona(context);

    const techVersions = generateVersionedTechStack(context);
    const commandsSection = generateCommandsSection(context);

    const content =
      metadata +
      `# ${getProjectName(context.projectPath)}

${persona}

## Tech Stack

${techVersions}
${commandsSection}
## Hard Constraints

- NEVER use \`any\` type. Use \`unknown\` and narrow with type guards.
- NEVER swallow errors with empty catch blocks. Log and re-throw or handle explicitly.
- NEVER create duplicate utilities. Check @custom-tools.mdc before writing helpers.
- NEVER generate markdown documentation files — express intent through code, types, and naming.
- Before creating files, consult @project-structure.mdc for correct location.
- Reuse existing project tools — do not re-implement what already exists.
- Follow the project's established patterns and conventions.
${generatePostCodingConstraint(context)}
${
  context.techStack.frameworks.length > 0
    ? `\n${this.generateFrameworkPrinciples(context)}\n`
    : ""
}
## Rule Index

| Rule | Scope |
|------|-------|
| @code-style.mdc | Formatting and naming conventions |
| @project-structure.mdc | Directory layout and file placement |
| @architecture.mdc | Module structure and design patterns |
${this.hasCustomTools(context) ? "| @custom-tools.mdc | Project-specific hooks, utils, API clients |\n" : ""}${this.hasErrorHandling(context) ? "| @error-handling.mdc | Error handling and logging patterns |\n" : ""}${this.hasStateManagement(context) ? "| @state-management.mdc | State management conventions |\n" : ""}${context.frontendRouter ? "| @frontend-routing.mdc | Frontend routing patterns |\n" : ""}${context.backendRouter ? "| @api-routing.mdc | API endpoint conventions |\n" : ""}${isFrontendProject(context) ? "| @ui-ux.mdc | UI component and UX patterns |\n" : ""}${(isFrontendProject(context) && (context.customPatterns?.apiClient?.exists || context.techStack.dependencies.some((d) => d.name === "axios"))) ? "| @api-patterns.mdc | API call conventions and HTTP client usage |\n" : ""}${isFrontendProject(context) ? "| @feature-recipe.mdc | End-to-end guide for adding a new feature |\n" : ""}${(featureExists(context, "testing") || detectTestFramework(context) !== null) ? "| @testing.mdc | Testing patterns and organization |\n" : ""}
`;

    return {
      scope: "global",
      modulePath: context.projectPath,
      content,
      fileName: "global-rules.mdc",
      priority: 100,
      type: "overview",
    };
  }

  /**
   * Feature Recipe — 端到端功能创建指南
   * 回答"我要新增一个完整功能需要创建哪些文件、遵循什么步骤"这个核心问题
   */
  private async generateFeatureRecipeRule(context: RuleGenerationContext): Promise<CursorRule> {
    const metadata = buildRuleMetadata(
      "端到端功能创建指南",
      "Step-by-step recipe for adding a complete feature: types → API → store → component → route",
      88,
      context.techStack.primary,
      ["feature", "workflow", "recipe"],
      "guideline",
      ["global-rules", "project-structure", "architecture"]
    );

    const isTS = context.techStack.languages.includes("TypeScript");
    const ext = isTS ? "ts" : "js";
    const extx = isTS ? "tsx" : "jsx";
    const org = context.fileOrganization;

    const stateLib = context.techStack.dependencies.find((d) =>
      ["redux", "mobx", "zustand", "pinia", "vuex"].some((lib) =>
        d.name.toLowerCase().includes(lib)
      )
    );
    const hasMobX = stateLib?.name?.toLowerCase().includes("mobx");
    const hasRedux = stateLib?.name?.toLowerCase().includes("redux");
    const hasZustand = stateLib?.name?.toLowerCase().includes("zustand");

    // 基于版本 + 实际代码检测 MobX 模式，与 state-management.mdc 保持一致
    const mobxPattern = hasMobX ? await detectMobXPattern(context) : 'makeAutoObservable';

    const apiClient = context.customPatterns?.apiClient;
    const apiClientName = apiClient?.name || "apiClient";
    const hasAxios = context.techStack.dependencies.some((d) => d.name === "axios");

    const typeDir = org?.typesLocation?.[0] || `src/types`;
    const apiDir = org?.apiLocation?.[0] || `src/api`;
    const storeDir = `src/store`;
    const compDir = org?.componentLocation?.[0] || `src/components`;
    // 路由注册的页面组件（步骤6被 router 挂载）应放在页面目录，而非可复用组件目录
    // 优先从 deepAnalysis 检测 views/pages/screens 目录（与 generateNewFileGuidelines 逻辑一致）
    const PAGE_DIR_KEYWORDS = new Set(['views', 'pages', 'screens']);
    const pageDir = (context.deepAnalysis ?? [])
      .filter(d => PAGE_DIR_KEYWORDS.has(d.path.split('/').pop()?.toLowerCase() ?? ''))
      .sort((a, b) => a.depth - b.depth)[0]?.path || compDir;
    const routeDir = (context.frontendRouter?.info?.location?.[0] || `src/routes`).replace(/\/$/, '');
    const hookDir = org?.hooksLocation?.[0] || `src/hooks`;

    // 将检测到的 typeDir 转为 import 别名（src/xxx → @/xxx）
    const typeAlias = typeDir.replace(/^src\//, '@/');
    const apiAlias = apiDir.replace(/^src\//, '@/');

    let storeStep = "";
    if (hasMobX) {
      // 根据检测到的实际 MobX 模式选择模板
      const mobxStoreBody = mobxPattern === 'makeAutoObservable'
        ? `import { makeAutoObservable } from "mobx";
import type { FeatureItem } from "${typeAlias}/feature";

class FeatureStore {
  items: FeatureItem[] = [];
  loading = false;
  error: string | null = null;

  constructor() { makeAutoObservable(this); }

  async fetchItems() {
    this.loading = true;
    try {
      this.items = await fetchFeatureList();
    } catch (err) {
      this.error = String(err);
    } finally {
      this.loading = false;
    }
  }
}`
        : `import { makeObservable, observable, action } from "mobx";
import type { FeatureItem } from "${typeAlias}/feature";

class FeatureStore {
  @observable items: FeatureItem[] = [];
  @observable loading = false;
  @observable error: string | null = null;

  constructor() { makeObservable(this); }

  @action
  async fetchItems() {
    this.loading = true;
    try {
      this.items = await fetchFeatureList();
    } catch (err) {
      this.error = String(err);
    } finally {
      this.loading = false;
    }
  }
}`;

      storeStep = `
### 3. Store（MobX）

\`\`\`${ext}
// ${storeDir}/featureStore.${ext}
${mobxStoreBody}
export const featureStore = new FeatureStore();
\`\`\`
`;
    } else if (hasRedux) {
      storeStep = `
### 3. Store（Redux Toolkit）

\`\`\`${ext}
// ${storeDir}/featureSlice.${ext}
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { FeatureItem } from "${typeAlias}/feature";

export const loadFeatures = createAsyncThunk("feature/load", fetchFeatureList);

const featureSlice = createSlice({
  name: "feature",
  initialState: { items: [] as FeatureItem[], loading: false, error: null as string | null },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(loadFeatures.pending, (s) => { s.loading = true; });
    b.addCase(loadFeatures.fulfilled, (s, a) => { s.loading = false; s.items = a.payload; });
    b.addCase(loadFeatures.rejected, (s, a) => { s.loading = false; s.error = a.error.message ?? null; });
  },
});
export default featureSlice.reducer;
\`\`\`
`;
    } else if (hasZustand) {
      storeStep = `
### 3. Store（Zustand）

\`\`\`${ext}
// ${storeDir}/featureStore.${ext}
import { create } from "zustand";
import type { FeatureItem } from "${typeAlias}/feature";

interface FeatureStore {
  items: FeatureItem[];
  loading: boolean;
  fetchItems: () => Promise<void>;
}

export const useFeatureStore = create<FeatureStore>((set) => ({
  items: [],
  loading: false,
  fetchItems: async () => {
    set({ loading: true });
    const items = await fetchFeatureList();
    set({ items, loading: false });
  },
}));
\`\`\`
`;
    }

    const content = metadata + `
# 端到端功能创建指南

> 新增一个完整功能时，按此顺序创建文件，避免缺漏。

## 标准步骤

### 1. 类型定义

\`\`\`${ext}
// ${typeDir}/feature.${ext}
export interface FeatureItem {
  id: string;
  name: string;
  // ...项目实际字段
}

export interface FeatureListParams {
  page: number;
  pageSize: number;
}
\`\`\`

### 2. API 函数

\`\`\`${ext}
// ${apiDir}/feature.${ext}
import type { FeatureItem, FeatureListParams } from "${typeAlias}/feature";
${hasAxios ? `import { ${apiClientName} } from "${apiAlias}";` : ""}

export async function fetchFeatureList(params: FeatureListParams): Promise<FeatureItem[]> {
  const { data } = await ${hasAxios ? apiClientName : "fetch"}${hasAxios ? `.get("/api/features", { params })` : '(`/api/features?page=${params.page}`)'};
  return data;
}

export async function fetchFeatureById(id: string): Promise<FeatureItem> {
  const { data } = await ${hasAxios ? `${apiClientName}.get(\`/api/features/\${id}\`)` : `fetch(\`/api/features/\${id}\`)`};
  return data;
}
\`\`\`
${storeStep}
### ${stateLib ? "4" : "3"}. 可复用 Hook（可选）

\`\`\`${ext}
// ${hookDir}/useFeature.${ext}
export function useFeature(id: string) {
  // 封装数据获取、loading 状态、错误处理
  // 组件直接调用，不重复写 fetch 逻辑
}
\`\`\`

### ${stateLib ? "5" : "4"}. 页面组件

\`\`\`${extx}
// ${pageDir}/FeatureList/FeatureList.${extx}
// 只负责渲染，业务逻辑在 Hook / Store 中
export function FeatureList() {
  // 1. 从 store/hook 获取数据
  // 2. 处理 loading / error 状态
  // 3. 渲染列表
}
\`\`\`

### ${stateLib ? "6" : "5"}. 路由注册

\`\`\`${extx}
// ${routeDir}/index.${extx} 或路由配置文件
{ path: "/features", element: <FeatureList /> }
{ path: "/features/:id", element: <FeatureDetail /> }
\`\`\`

## 文件检查清单

新建功能后确认以下文件已创建/更新：

- [ ] \`${typeDir}/feature.${ext}\` — 类型定义
- [ ] \`${apiDir}/feature.${ext}\` — API 函数
${stateLib ? `- [ ] \`${storeDir}/featureStore.${ext}\` — Store\n` : ""}- [ ] \`${hookDir}/useFeature.${ext}\` — 数据 Hook（可选）
- [ ] \`${pageDir}/FeatureList/\` — 页面组件
- [ ] 路由配置已更新

---

*遵循此模式保持项目一致性。参考 @project-structure.mdc 确认各类文件的实际目录位置。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "feature-recipe.mdc",
      priority: 88,
      type: "guideline",
      depends: ["global-rules", "project-structure", "architecture"],
    };
  }

  /**
   * 生成开发指南
   */
  private generateDevelopmentGuidelines(
    context: RuleGenerationContext
  ): string {
    let guidelines = "";

    // 根据技术栈生成指南
    const { primary, languages } = context.techStack;

    if (languages.includes("TypeScript")) {
      guidelines += `## TypeScript 使用

- 优先使用 TypeScript 编写新代码
- 为所有公共 API 提供完整的类型定义
- 启用严格模式 (\`strict: true\`)
- 避免使用 \`any\`，使用 \`unknown\` 或具体类型

`;
    }

    if (primary.some((p) => p.toLowerCase().includes("react"))) {
      guidelines += `## React 开发

- 使用函数组件和 Hooks，避免类组件
- 遵循组件单一职责原则
- 使用 PropTypes 或 TypeScript 进行类型检查
- 合理使用 \`useMemo\` 和 \`useCallback\` 优化性能

`;
    }

    if (primary.some((p) => p.toLowerCase().includes("next"))) {
      guidelines += `## Next.js 规范

- 优先使用 App Router（如果项目使用）
- Server Components 中进行数据获取
- 使用 \`next/image\` 优化图片
- 配置适当的元数据以改善 SEO

`;
    }

    if (primary.some((p) => p.toLowerCase().includes("vue"))) {
      guidelines += `## Vue 开发

- 使用 Composition API（Vue 3）
- 保持组件模板简洁
- 复杂逻辑抽取到 composables
- 使用 TypeScript 增强类型安全

`;
    }

    if (languages.includes("Python")) {
      guidelines += `## Python 开发

- 遵循 PEP 8 代码风格
- 使用类型注解（Type Hints）
- 编写 docstrings 文档
- 使用虚拟环境管理依赖

`;
    }

    // 添加错误处理指南（使用基于项目实践的版本）
    guidelines += context.projectPractice
      ? generatePracticeBasedErrorHandling(context)
      : generateErrorHandlingGuidelines(context);

    // 添加测试相关指南（按需生成）
      guidelines += generateConditionalTestingRules(context);

    // 添加 UI/UX 规范（前端项目）
    if (isFrontendProject(context)) {
      guidelines += generateUIUXGuidelines(context);
    }

    // 添加 API 相关指南
    if (context.codeFeatures["api-routes"]) {
      guidelines += `## API 开发

- 使用 RESTful 设计原则
- 提供适当的错误处理和状态码
- 为 API 编写文档（OpenAPI/Swagger）
- 实施适当的认证和授权

`;
    }

    return guidelines || "遵循项目现有代码风格和约定。";
  }

  /**
   * 生成最佳实践部分
   */
  private generateBestPracticesSection(practices: BestPractice[]): string {
    if (practices.length === 0) {
      return "请参考官方文档获取最佳实践建议。";
    }

    // 按优先级排序
    const sorted = practices.sort((a, b) => b.priority - a.priority);

    return sorted
      .map(
        (p) => `## ${p.category}

${p.content}

*来源：${p.source}*
`
      )
      .join("\n---\n\n");
  }

  /**
   * 生成文件组织指南（精简版）
   * v1.9: 移除详细文件组织示例，避免与 project-structure.mdc 重复
   */
  private generateFileOrganizationGuidelines(
    context: RuleGenerationContext
  ): string {
    return `## 文件组织原则

> 💡 **详细指南**: 完整的文件组织和目录结构请参考 **@project-structure.mdc**

### 基本原则
- 按功能模块组织文件，而非按文件类型
- 相关文件放在一起
- 保持目录结构扁平，避免过深嵌套
- 使用清晰的命名约定

`;
  }

  /**
   * 生成注意事项
   */
  private generateCautions(context: RuleGenerationContext): string {
    const cautions: string[] = [];

    cautions.push("- 提交前运行测试确保代码质量");
    cautions.push("- 遵循项目现有的代码风格和约定");
    cautions.push("- 更新代码时同步更新相关文档");

    if (context.techStack.languages.includes("TypeScript")) {
      cautions.push("- 避免使用类型断言（as），除非绝对必要");
      cautions.push("- 不要禁用 TypeScript 检查（@ts-ignore）");
    }

    if (context.codeFeatures["database"]) {
      cautions.push("- 数据库迁移需要仔细测试");
      cautions.push("- 避免在代码中硬编码数据库凭证");
    }

    if (context.codeFeatures["api-routes"]) {
      cautions.push("- API 变更需要考虑向后兼容性");
      cautions.push("- 敏感数据不要记录到日志");
    }

    return cautions.map((c) => c).join("\n");
  }

  /**
   * 生成规则摘要
   */
  generateSummary(rules: CursorRule[], projectPath: string): string {
    const descriptionByFile: Record<string, string> = {
      "global-rules.mdc": "项目全局导航与核心原则",
      "code-style.mdc": "代码格式、命名与风格要求",
      "project-structure.mdc": "项目目录结构与职能说明（新建文件前必读）",
      "architecture.mdc": "模块结构与架构设计规范",
      "custom-tools.mdc": "项目自定义 Hooks 与工具函数清单",
      "error-handling.mdc": "错误处理与日志管理实践",
      "state-management.mdc": "状态管理库的使用准则",
      "ui-ux.mdc": "组件交互与 UI/UX 规范",
      "frontend-routing.mdc": "前端路由定义与导航策略",
      "api-routing.mdc": "后端或 API 路由组织规范",
      "testing.mdc": "测试策略与断言准则",
      "custom-rules.mdc": "自定义规则（可选，用户可自行填写）",
      "00-global-rules.mdc": "项目全局导航与核心原则",
    };

    const lines: string[] = [];
    lines.push("cursor-rules-generators 输出以下规则文件：");

    for (const rule of rules) {
      const relativePath =
        rule.scope === "module" && rule.modulePath
          ? path.join(
              path.relative(projectPath, rule.modulePath),
              ".cursor",
              "rules",
              rule.fileName
            )
          : path.join(".cursor", "rules", rule.fileName);

      let description = descriptionByFile[rule.fileName];

      if (!description) {
        switch (rule.type) {
          case "overview":
            description = "模块概述与职责";
            break;
          case "guideline":
            description = "工作流程与实现指引";
            break;
          case "practice":
            description = "基于项目的实践规范";
            break;
          case "reference":
            description = "可复用的参考资料";
            break;
          default:
            description = "项目专用开发规范";
        }
      }

      if (rule.scope === "module") {
        description = `${rule.moduleName || "模块"} 专属规范：${description}`;
      }

      lines.push(`- ${relativePath}：${description}`);
    }

    return lines.join("\n");
  }

  /**
   * 生成框架特定原则（增强版，参考 awesome-cursorrules）
   */
  private generateFrameworkPrinciples(context: RuleGenerationContext): string {
    const frameworks = context.techStack.frameworks;
    let principles = "";

    if (frameworks.includes("React")) {
      principles += `- **React**: 
  - 使用函数组件和 Hooks，避免类组件
  - 保持组件单一职责原则
  - 合理使用 \`useMemo\` 和 \`useCallback\` 优化性能
  - 使用 TypeScript 进行类型检查
`;
    }
    if (frameworks.includes("Vue")) {
      principles += `- **Vue**: 
  - 使用 Composition API（Vue 3）
  - 保持组件模板简洁
  - 复杂逻辑抽取到 composables
  - 使用 TypeScript 增强类型安全
`;
    }
    if (frameworks.includes("Next.js")) {
      principles += `- **Next.js**: 
  - 优先使用 App Router（如果项目使用）
  - Server Components 中进行数据获取
  - 使用 \`next/image\` 优化图片
  - 配置适当的元数据以改善 SEO
  - 最小化 'use client' 使用，优先使用 Server Components
`;
    }
    if (frameworks.includes("Angular")) {
      principles += `- **Angular**: 
  - 使用组件和模块化架构
  - 遵循 Angular 风格指南
  - 使用 TypeScript 和依赖注入
`;
    }
    if (frameworks.includes("Svelte")) {
      principles += `- **Svelte**: 
  - 利用 Svelte 的编译时优化
  - 使用响应式声明和语句
  - 保持组件简洁和高效
`;
    }

    return principles || "- 遵循框架的官方最佳实践";
  }

  /**
   * 检测项目实际使用的 MobX 模式。
   *
   * 优先级（从高到低）：
   * 1. 实际代码：扫描项目 store 文件，出现哪种写法用哪种
   * 2. 安装版本：MobX < 6 只有 decorator 写法；6+ 两种均可
   * 3. fallback：makeAutoObservable（MobX 6+ 官方推荐的简洁写法）
   */
  /**
   * 格式化缺失的最佳实践（v1.5）
   * 将项目已使用但未声明的实践格式化为规则内容
   */
  /**
   * 识别项目使用但规则中没有的技术栈（v1.5）
   */
  private identifyMissingTechStacks(
    projectTechStack: TechStack,
    match: FrameworkMatch | TechStackMatch | null
  ): string[] {
    if (!match) {
      return [];
    }

    const allProjectTech = [
      ...projectTechStack.primary,
      ...projectTechStack.frameworks,
      ...projectTechStack.languages,
    ];

    // 获取匹配规则中的技术栈
    let matchedTech: string[] = [];

    if ("techStack" in match && match.techStack) {
      // 多类别匹配
      matchedTech = match.techStack;
    } else if ("framework" in match) {
      // 框架匹配（向后兼容）
      const frameworkTechStacks: Record<string, string[]> = {
        "react-typescript": ["React", "TypeScript", "Shadcn", "Tailwind"],
        "nextjs-typescript": ["Next.js", "TypeScript", "React", "Tailwind"],
        "nextjs-app-router": ["Next.js", "React", "TypeScript", "Tailwind"],
        "nextjs-15-react-19": [
          "Next.js",
          "React",
          "TypeScript",
          "Tailwind",
          "Vercel",
        ],
        "vue-typescript": ["Vue", "TypeScript"],
        "angular-typescript": ["Angular", "TypeScript"],
        "sveltekit-typescript": ["Svelte", "TypeScript", "Tailwind"],
        "typescript-react": ["TypeScript", "React", "Next.js"],
      };
      matchedTech = frameworkTechStacks[match.framework] || [];
    }

    const frameworkTech = matchedTech;
    const frameworkTechLower = frameworkTech.map((t) => t.toLowerCase());

    // 找出项目使用但框架规则中没有的技术栈
    const missing = allProjectTech.filter((tech) => {
      const techLower = tech.toLowerCase();
      return !frameworkTechLower.some(
        (ft) => techLower.includes(ft) || ft.includes(techLower)
      );
    });

    return missing;
  }

  /**
   * 获取备用最佳实践（无网络情况下的备用方案）（v1.5）
   */
  private getFallbackPractices(techStacks: string[]): any[] {
    const practices: any[] = [];

    // 内置的通用最佳实践（作为备用方案）
    const fallbackPractices: Record<string, any[]> = {
      TypeScript: [
        {
          category: "code-style",
          title: "TypeScript 类型安全",
          content:
            "始终使用明确的类型定义，避免使用 `any`。优先使用接口（interface）定义对象类型，使用类型别名（type）定义联合类型和复杂类型。",
          techStack: ["TypeScript"],
          priority: "high" as const,
        },
      ],
      React: [
        {
          category: "component",
          title: "React 组件最佳实践",
          content:
            "使用函数组件和 Hooks。保持组件单一职责，合理拆分大型组件。使用 `useMemo` 和 `useCallback` 优化性能，但避免过度优化。",
          techStack: ["React"],
          priority: "high" as const,
        },
      ],
      Vue: [
        {
          category: "component",
          title: "Vue 组件最佳实践",
          content:
            "使用 Composition API（Vue 3）。保持组件模板简洁，复杂逻辑抽取到 composables。使用 TypeScript 增强类型安全。",
          techStack: ["Vue"],
          priority: "high" as const,
        },
      ],
      "Node.js": [
        {
          category: "architecture",
          title: "Node.js 项目结构",
          content:
            "使用模块化结构，按功能组织代码。使用环境变量管理配置。实现统一的错误处理机制。",
          techStack: ["Node.js"],
          priority: "medium" as const,
        },
      ],
      Express: [
        {
          category: "routing",
          title: "Express 路由最佳实践",
          content:
            "使用路由模块化，按功能组织路由。实现中间件进行认证、日志、错误处理。使用 async/await 处理异步操作。",
          techStack: ["Express"],
          priority: "medium" as const,
        },
      ],
    };

    for (const tech of techStacks) {
      // 查找匹配的备用实践
      for (const [key, value] of Object.entries(fallbackPractices)) {
        if (
          tech.toLowerCase().includes(key.toLowerCase()) ||
          key.toLowerCase().includes(tech.toLowerCase())
        ) {
          practices.push(...value);
        }
      }
    }

    return practices;
  }

  /**
   * 生成自定义工具使用规则（v1.2）
   */
}
