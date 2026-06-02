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
import { ModuleStructureAnalyzer } from '../analyzers/module-structure-analyzer.js';
import { ModuleBusinessAnalyzer } from '../analyzers/module-business-analyzer.js';
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
  private moduleStructureAnalyzer: ModuleStructureAnalyzer;
  private moduleBusinessAnalyzer: ModuleBusinessAnalyzer;

  constructor() {
    this.suggestionCollector = new SuggestionCollector();
    this.bestPracticeExtractor = new BestPracticeExtractor();
    this.bestPracticeComparator = new BestPracticeComparator();
    this.webSearcher = new BestPracticeWebSearcher();
    this.requirementsAnalyzer = new RuleRequirementsAnalyzer();
    this.moduleStructureAnalyzer = new ModuleStructureAnalyzer();
    this.moduleBusinessAnalyzer = new ModuleBusinessAnalyzer();
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
    const codeStyleRule = this.generateCodeStyleRule(context, missingPractices);
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
      const customToolsRule = this.generateCustomToolsRule(context);
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
      const stateManagementRule = await this.generateStateManagementRule(context);
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
        const moduleRule = await this.generateModuleOverviewRule(context, module);
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
   * v1.3: 生成代码风格规则（约 200 行）
   * v1.5: 补充缺失的最佳实践
   */
  private generateCodeStyleRule(
    context: RuleGenerationContext,
    missingPractices?: any[]
  ): CursorRule {
    const langGlobs = getLanguageGlobs(context);
    const metadata = buildRuleMetadata(
      "代码风格规范",
      "Code style, formatting, and naming conventions derived from project config",
      90,
      context.techStack.primary,
      ["style", "formatting"],
      "guideline",
      ["global-rules"],
      { globs: langGlobs }
    );

    // 补充缺失的最佳实践
    const codeStylePractices =
      missingPractices?.filter((p) => p.category === "code-style") || [];
    const additionalPractices = formatMissingPractices(codeStylePractices);

    const content =
      metadata +
      `
# Code Style

${
  context.projectConfig
    ? this.generateConfigBasedStyleRules(context)
    : this.generateCodeStyleGuidelines(context)
}

## Do / Don't

\`\`\`typescript
// DON'T: use any — 失去类型保护
function process(data: any) { return data.value; }

// DO: 使用精确类型
function process(data: ProcessInput): ProcessOutput {
  return data.value;
}
\`\`\`

\`\`\`typescript
// DON'T: 隐式类型 + 可变默认
var count = 0;

// DO: 显式类型 + 不可变优先
const count: number = 0;
\`\`\`

> 错误处理规范请参考 **@error-handling.mdc**

${additionalPractices ? `## Additional Best Practices\n\n${additionalPractices}\n` : ""}
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "code-style.mdc",
      priority: 90,
      type: "guideline",
      depends: ["global-rules"],
    };
  }

  /**
   * v1.3: 生成自定义工具规则（约 150 行）
   */
  private generateCustomToolsRule(context: RuleGenerationContext): CursorRule {
    const hookGlobs = this.getHookGlobs(context);
    const metadata = buildRuleMetadata(
      "项目自定义工具",
      "Consult before implementing features — lists project-specific hooks, utilities, and API clients that MUST be reused",
      95,
      context.techStack.primary,
      ["custom-tools", "reference"],
      "reference",
      ["global-rules"],
      hookGlobs ? { globs: hookGlobs } : undefined
    );

    const content =
      metadata +
      `
# 项目自定义工具

参考: @global-rules.mdc

${this.generateCustomToolsRules(context)}

---

*使用项目工具保持代码一致性，避免重复实现。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "custom-tools.mdc",
      priority: 95,
      type: "reference",
      depends: ["global-rules"],
    };
  }

  /**
   * v1.3: 生成状态管理规则（约 200 行）
   */
  private async generateStateManagementRule(
    context: RuleGenerationContext
  ): Promise<CursorRule> {
    const stateLib = context.techStack.dependencies.find((d) =>
      ["redux", "mobx", "zustand", "pinia", "vuex"].some((lib) =>
        d.name.toLowerCase().includes(lib)
      )
    );

    // MobX 时基于版本 + 实际代码检测使用模式
    const isMobX = stateLib?.name?.toLowerCase().includes('mobx') ?? false;
    const mobxPattern = isMobX ? await this.detectMobXPattern(context) : 'makeAutoObservable';

    const storeGlobs = this.getStoreGlobs(context);
    const metadata = buildRuleMetadata(
      "状态管理规范",
      `Consult when implementing state management, data flow, or ${stateLib?.name || "store"}-related code`,
      85,
      context.techStack.primary,
      ["state-management", "practice"],
      "practice",
      ["global-rules"],
      storeGlobs ? { globs: storeGlobs } : undefined
    );

    const content =
      metadata +
      `
# 状态管理规范

参考: @global-rules.mdc

${this.generateStateManagementContent(context, stateLib?.name, mobxPattern)}

---

*状态管理是项目的核心，遵循既定模式。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "state-management.mdc",
      priority: 85,
      type: "practice",
      depends: ["global-rules"],
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
    const mobxPattern = hasMobX ? await this.detectMobXPattern(context) : 'makeAutoObservable';

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

  private generateCodeStyleGuidelines(context: RuleGenerationContext): string {
    let style = `## 通用规范

- 使用有意义的变量和函数名
- 保持函数简短，单一职责
- 添加必要的注释，解释"为什么"而非"是什么"
- 保持代码格式一致

`;

    // 根据语言添加特定风格
    if (
      context.techStack.languages.includes("JavaScript") ||
      context.techStack.languages.includes("TypeScript")
    ) {
      style += this.generateJavaScriptStyleGuide(context);
    }

    if (context.techStack.languages.includes("Python")) {
      style += this.generatePythonStyleGuide();
    }

    // 添加格式化和命名约定
    style += this.generateFormattingRules(context);
    style += this.generateNamingConventions(context);

    return style;
  }

  /**
   * 生成 JavaScript/TypeScript 风格指南
   */
  private generateJavaScriptStyleGuide(context: RuleGenerationContext): string {
    const isTypeScript = context.techStack.languages.includes("TypeScript");

    return `## JavaScript/TypeScript 代码风格

### 基本规范
- 使用 \`const\` 和 \`let\`，避免 \`var\`
- 优先使用箭头函数
- 使用模板字符串而非字符串拼接
- 使用解构赋值简化代码
- 使用 async/await 处理异步操作

### 格式化规则
- **字符串**：优先使用单引号 \`'string'\`，除非需要插值则使用反引号 \`\\\`template\\\`\`
- **分号**：保持一致（推荐使用分号）
- **行长度**：限制每行最多 100 个字符
- **缩进**：使用 2 个空格（或根据项目配置）
- **尾随逗号**：多行对象/数组最后一项添加逗号

### 代码组织
- **导入顺序**：
  1. 外部库导入
  2. 内部模块导入
  3. 相对路径导入
  ${isTypeScript ? "4. 类型导入（使用 `import type`）" : ""}
- **导出**：优先使用命名导出，避免默认导出（提高可维护性）

${
  isTypeScript
    ? `### TypeScript 特定规范
- 优先使用 \`interface\` 定义对象类型
- 使用 \`type\` 定义联合类型和工具类型
- 避免使用 \`any\`，使用 \`unknown\` 代替
- 为函数参数和返回值显式添加类型
- 使用严格模式（\`strict: true\`）
- 使用类型守卫而非类型断言
`
    : ""
}
`;
  }

  /**
   * 生成 Python 风格指南
   */
  private generatePythonStyleGuide(): string {
    return `## Python 代码风格

### PEP 8 规范
- **缩进**：使用 4 个空格
- **行长度**：限制每行最多 79 个字符（文档字符串/注释 72 个字符）
- **空行**：
  - 顶级函数和类定义之间空 2 行
  - 类内方法之间空 1 行
- **字符串引号**：保持一致（推荐单引号）

### 命名规范
- **函数/变量**：snake_case (例如：\`get_user_data\`)
- **类名**：PascalCase (例如：\`UserProfile\`)
- **常量**：UPPER_CASE (例如：\`MAX_RETRY_COUNT\`)
- **私有属性**：单下划线前缀 (例如：\`_internal_method\`)
- **特殊方法**：双下划线前后 (例如：\`__init__\`)

### 导入规范
- **导入顺序**：
  1. 标准库导入
  2. 第三方库导入
  3. 本地应用/库导入
- 每组之间空一行
- 避免通配符导入 (\`from module import *\`)

### 类型注解
- 为函数参数添加类型注解
- 为函数返回值添加类型注解
- 使用 \`typing\` 模块的类型（List, Dict, Optional 等）
- 使用 \`mypy\` 进行静态类型检查

`;
  }

  /**
   * 生成格式化规则
   */
  private generateFormattingRules(context: RuleGenerationContext): string {
    return `## 代码格式化

### 空格和缩进
- 运算符两侧添加空格：\`a + b\` 而非 \`a+b\`
- 逗号后添加空格：\`[1, 2, 3]\` 而非 \`[1,2,3]\`
- 关键字后添加空格：\`if (condition)\` 而非 \`if(condition)\`
- 不要在括号内侧添加空格：\`func(a, b)\` 而非 \`func( a, b )\`

### 代码块
- 始终使用花括号，即使只有一行代码
- \`else\` 语句与关闭花括号在同一行（JavaScript/TypeScript）
- 花括号的左括号不换行（K&R 风格）

### 注释规范
- 单行注释使用 \`//\`（JavaScript/TypeScript）或 \`#\`（Python）
- 多行注释使用 \`/* */\`（JavaScript/TypeScript）或 \`"""\`（Python）
- 注释应该解释"为什么"而不是"是什么"
- 保持注释与代码同步更新

`;
  }

  /**
   * 生成命名约定
   */
  private generateNamingConventions(context: RuleGenerationContext): string {
    return `## 命名约定

### 通用规则
- **组件/类/接口**：PascalCase
  - 示例：\`UserProfile\`, \`DataService\`, \`IUserRepository\`
- **变量/函数/方法**：camelCase
  - 示例：\`userName\`, \`getUserData()\`, \`handleClick()\`
- **常量**：UPPER_CASE
  - 示例：\`MAX_RETRY_COUNT\`, \`API_BASE_URL\`, \`DEFAULT_TIMEOUT\`
- **私有属性**：前缀 \`_\`（约定）或使用 \`#\`（JavaScript 私有字段）
  - 示例：\`_privateMethod\`, \`#privateField\`

### 文件命名
${this.generateFileNamingRules(context)}

### 特定场景
- **布尔变量**：使用 \`is\`、\`has\`、\`should\` 前缀
  - 示例：\`isActive\`, \`hasPermission\`, \`shouldUpdate\`
- **事件处理器**：使用 \`handle\` 或 \`on\` 前缀
  - 示例：\`handleClick\`, \`onSubmit\`, \`handleUserLogin\`
- **获取器/设置器**：使用 \`get\`/\`set\` 前缀
  - 示例：\`getUser\`, \`setUser\`, \`getUserName\`

### 避免的命名
- ❌ 单字母变量（除了循环计数器 \`i\`, \`j\`, \`k\`）
- ❌ 缩写和简写（除非是广为人知的，如 \`URL\`, \`HTTP\`）
- ❌ 匈牙利命名法（如 \`strName\`, \`intCount\`）
- ❌ 无意义的名称（如 \`data\`, \`temp\`, \`foo\`, \`bar\`）

`;
  }

  /**
   * 生成文件命名规则
   */
  private generateFileNamingRules(context: RuleGenerationContext): string {
    const hasReact = context.techStack.frameworks.includes("React");
    const hasVue = context.techStack.frameworks.includes("Vue");

    let rules = "";

    if (hasReact) {
      rules += `- **React 组件**：PascalCase.tsx/jsx
  - 示例：\`UserProfile.tsx\`, \`Button.tsx\`
`;
    }

    if (hasVue) {
      rules += `- **Vue 组件**：PascalCase.vue 或 kebab-case.vue
  - 示例：\`UserProfile.vue\` 或 \`user-profile.vue\`
`;
    }

    rules += `- **工具/辅助文件**：camelCase 或 kebab-case
  - 示例：\`formatDate.ts\`, \`api-client.ts\`
- **类型定义文件**：types.ts 或 interfaces.ts
- **测试文件**：与源文件同名 + \`.test\` 或 \`.spec\`
  - 示例：\`UserProfile.test.tsx\`, \`utils.spec.ts\`
`;

    return rules;
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
   * 生成模块职责说明
   */
  private generateModuleResponsibilities(
    module: Module,
    businessAnalysis?: any
  ): string {
    let description = "";

    // 如果有业务分析，使用业务领域信息
    if (businessAnalysis?.businessDomain) {
      description = `负责 ${businessAnalysis.businessDomain} 相关的功能`;
    } else {
    const typeDescriptions: Record<string, string> = {
      frontend: "负责用户界面展示和交互逻辑",
      backend: "负责业务逻辑处理和数据管理",
      shared: "提供跨模块共享的工具和类型定义",
      service: "提供特定领域的服务功能",
      package: "作为独立包提供特定功能",
      other: "提供项目所需的功能",
    };
      description = typeDescriptions[module.type] || "提供项目所需的功能";
    }

    // 如果有主要功能，添加到描述中
    if (businessAnalysis?.mainFeatures && businessAnalysis.mainFeatures.length > 0) {
      description += `，主要包括：${businessAnalysis.mainFeatures.slice(0, 3).join("、")}`;
    }

    return description;
  }

  /**
   * 获取模块的 package.json 信息
   */
  private async getModulePackageInfo(modulePath: string): Promise<{
    name?: string;
    description?: string;
    keywords?: string[];
    version?: string;
  } | null> {
    const packageJsonPath = path.join(modulePath, "package.json");
    
    if (await FileUtils.fileExists(packageJsonPath)) {
      try {
        const content = await FileUtils.readFile(packageJsonPath);
        const data = JSON.parse(content);
        return {
          name: data.name,
          description: data.description,
          keywords: data.keywords,
          version: data.version,
        };
      } catch (error) {
        logger.debug(`读取 package.json 失败: ${packageJsonPath}`, error);
      }
    }
    
    return null;
  }

  /**
   * 生成模块代码生成指南（优化版，符合 Cursor Rules 最佳实践）
   */
  private generateModuleCodeGenerationGuide(
    module: Module,
    context: RuleGenerationContext,
    structureAnalysis: any,
    businessAnalysis: any,
    packageName: string
  ): string {
    let guide = "";

    // 代码生成规则（使用明确的指令格式）
    guide += `### 代码生成规则\n\n`;
    guide += `**MUST** 遵循以下规则：\n\n`;
    guide += `1. **文件位置**: 查看 @project-structure.mdc 中 \`${module.name}\` 模块的目录结构，根据文件类型选择正确目录\n`;
    guide += `2. **命名规范**: 参考 @code-style.mdc 和 @project-structure.mdc\n`;
    guide += `3. **导入路径**: 遵循依赖引用规则（见下文）\n`;
    guide += `4. **代码风格**: 参考 @code-style.mdc 保持一致性\n`;
    
    if (module.type === "shared") {
      guide += `5. **模块边界**: 此模块为共享模块，代码必须保持通用性，避免特定业务逻辑\n\n`;
    } else {
      guide += `5. **模块边界**: 此模块为 ${getModuleTypeName(module.type)} 类型，代码需符合该类型职责范围\n\n`;
    }

    // 文件存放规则（从 project-structure 获取）
    guide += `### 文件存放规则\n\n`;
    guide += `**MUST**: 参考 @project-structure.mdc 中 \`${module.name}\` 模块的目录结构和文件夹职能说明。\n\n`;
    
    if (structureAnalysis && structureAnalysis.mainDirectories.length > 0) {
      const dirs = structureAnalysis.mainDirectories
        .filter((d: any) => {
          if (d.fileCount === 0 || !d.purpose || d.purpose === "") return false;
          // 只判断英文，不判断中文
          const purposeLower = d.purpose.toLowerCase();
          return purposeLower !== 'other' && purposeLower !== 'unknown';
        })
        .slice(0, 8);
      
      if (dirs.length > 0) {
        guide += `主要目录（完整信息见 @project-structure.mdc）：\n\n`;
        for (const dir of dirs) {
          const dirPath = dir.path;
          // 计算相对于模块路径的相对路径
          let relativePath: string;
          try {
            relativePath = path.relative(module.path, dirPath);
            // 如果路径相同，使用目录名
            if (!relativePath || relativePath === ".") {
              relativePath = path.basename(dirPath);
            }
          } catch {
            relativePath = path.basename(dirPath);
          }
          
          guide += `- \`${relativePath}/\`: ${dir.purpose}`;
          if (dir.namingPattern && dir.namingPattern !== "mixed") {
            guide += ` (${dir.namingPattern})`;
          }
          guide += `\n`;
        }
        guide += `\n`;
      }
    }

    // 依赖引用规则（使用明确的指令格式）
    guide += `### 依赖引用规则\n\n`;
    
    guide += `**模块内部引用** (SHOULD):\n`;
    guide += `\`\`\`typescript\n`;
    guide += `import { X } from '../utils/helper';\n`;
    guide += `import { X } from '@/utils/helper'; // 如果配置了别名\n`;
    guide += `\`\`\`\n\n`;
    
    // 引用其他内部模块
    if (businessAnalysis && businessAnalysis.internalDependencies.length > 0) {
      guide += `**引用其他内部模块** (SHOULD):\n`;
      guide += `\`\`\`typescript\n`;
      for (const dep of businessAnalysis.internalDependencies.slice(0, 3)) {
        guide += `import { X } from '${dep}';\n`;
      }
      guide += `\`\`\`\n\n`;
    }
    
    // 被其他模块引用
    if (businessAnalysis && businessAnalysis.dependentModules.length > 0) {
      guide += `**被其他模块引用** (参考):\n`;
      guide += `其他模块可通过包名引用：\`import { X } from '${packageName}'\`\n\n`;
    }
    
    // 外部依赖
    guide += `**外部依赖** (SHOULD):\n`;
    guide += `\`\`\`typescript\n`;
    guide += `import { X } from 'package-name';\n`;
    guide += `\`\`\`\n\n`;

    // 命名规范（仅在有明确模式时显示）
    if (structureAnalysis && structureAnalysis.fileOrganizationPattern.primaryNamingPattern !== "mixed") {
      guide += `### 命名规范\n\n`;
      const pattern = structureAnalysis.fileOrganizationPattern.primaryNamingPattern;
      guide += `主要命名模式: **${pattern}**\n\n`;
      guide += `示例：\n`;
      if (pattern === "PascalCase") {
        guide += `- \`UserProfile.tsx\`, \`ApiClient.ts\`, \`UserType.ts\`\n`;
      } else if (pattern === "camelCase") {
        guide += `- \`getUserData.ts\`, \`apiClient.ts\`, \`userHelper.ts\`\n`;
      } else if (pattern === "kebab-case") {
        guide += `- \`user-profile.tsx\`, \`api-client.ts\`, \`user-helper.ts\`\n`;
      }
      guide += `\n`;
      guide += `完整规范见 @code-style.mdc\n\n`;
    }

    // 导入导出模式（仅在有明确模式时显示）
    if (structureAnalysis && structureAnalysis.fileOrganizationPattern.usesIndexFiles) {
      guide += `### 导入导出模式\n\n`;
      guide += `使用 \`index.ts\` 作为目录入口：\n`;
      guide += `\`\`\`typescript\n`;
      guide += `// 从目录导入\n`;
      guide += `import { Component } from './components';\n`;
      guide += `\`\`\`\n\n`;
    }

    return guide;
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

  private getHookGlobs(context: RuleGenerationContext): string | null {
    // 直接使用 path.dirname 从 hook 文件路径获取其所在目录
    // 不过滤路径名语义或深度：hooks 可能在 composables/、features/xxx/hooks/ 等任意位置
    // 唯一安全过滤：排除绝对路径
    const hookDirs = (context.customPatterns?.customHooks ?? [])
      .map((h) => {
        const dir = path.dirname(h.relativePath);
        // path.dirname('file.ts') → '.' 说明在根目录，跳过
        if (dir === '.' || dir === '') return null;
        const normalized = dir.endsWith('/') ? dir : dir + '/';
        return !path.isAbsolute(normalized) ? normalized : null;
      })
      .filter((d): d is string => d !== null);
    const uniqueDirs = [...new Set(hookDirs)].slice(0, 3);
    if (uniqueDirs.length > 0) {
      return uniqueDirs.map((d) => `${d}**`).join(', ');
    }
    return '**/hooks/**';
  }

  private getStoreGlobs(context: RuleGenerationContext): string | null {
    const stateLib = context.techStack.dependencies.find((d) =>
      ['redux', 'mobx', 'zustand', 'pinia', 'vuex'].some((lib) =>
        d.name.toLowerCase().includes(lib)
      )
    );
    if (!stateLib) return null;

    // 收集所有作用域层级的 store 目录：
    //   - 全局层（src/store/, src/stores/）
    //   - 业务层（src/views/X/store/, src/features/X/state/, etc.）
    // 来源 1：fileOrganization.structure（已识别的文件组织信息）
    const structureDirs = (context.fileOrganization?.structure ?? [])
      .filter((d) => /\b(store|stores|slice|state|reducer)\b/i.test(d.path.split('/').pop() ?? ''))
      .map((d) => d.path.replace(/^\//, ''));

    // 来源 2：deepAnalysis（覆盖所有深度，含业务模块内的局部 store 目录）
    const deepDirs = (context.deepAnalysis ?? [])
      .filter((d) => /\b(store|stores|slice|state|reducer)\b/i.test(d.path.split('/').pop() ?? ''))
      .map((d) => d.path.replace(/^\//, ''));

    const allDirs = [...new Set([...structureDirs, ...deepDirs])]
      .filter((p) => p.length > 0 && !path.isAbsolute(p))
      .sort((a, b) => a.split('/').length - b.split('/').length); // 浅路径优先排列

    if (allDirs.length > 0) {
      return allDirs.map((d) => `${d.replace(/\/$/, '')}/**`).join(', ');
    }
    return '**/store/**, **/stores/**, **/slice/**';
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
  private async detectMobXPattern(
    context: RuleGenerationContext
  ): Promise<'makeAutoObservable' | 'decorator'> {
    // --- 步骤 1：扫描实际 store 文件内容 ---
    const deep = context.deepAnalysis || [];
    const storeDirs = deep
      .filter((d) => /\bstore[s]?\b/i.test(d.path.split('/').pop() ?? ''))
      .sort((a, b) => a.depth - b.depth)
      .slice(0, 3); // 只扫描最浅的 3 个 store 目录

    let foundAutoObservable = false;
    let foundDecorator = false;

    for (const dir of storeDirs) {
      try {
        const dirPath = path.join(context.projectPath, dir.path);
        const { readdir } = await import('fs/promises');
        const entries = await readdir(dirPath, { withFileTypes: true });
        const storeFiles = entries
          .filter((e) => e.isFile() && /\.(ts|tsx|js|jsx)$/.test(e.name))
          .slice(0, 5); // 每个目录最多抽查 5 个文件

        for (const file of storeFiles) {
          const filePath = path.join(dirPath, file.name);
          const content = await FileUtils.readFile(filePath);
          if (content.includes('makeAutoObservable')) foundAutoObservable = true;
          if (content.includes('@observable') || content.includes('makeObservable(this)')) {
            foundDecorator = true;
          }
          if (foundAutoObservable || foundDecorator) break;
        }
        if (foundAutoObservable || foundDecorator) break;
      } catch {
        // 目录读取失败时静默跳过
      }
    }

    // 实际代码中有 makeAutoObservable → 优先
    if (foundAutoObservable) return 'makeAutoObservable';
    // 实际代码中有 decorator 写法
    if (foundDecorator) return 'decorator';

    // --- 步骤 2：依据安装版本判断 ---
    const mobxDep = context.techStack.dependencies.find(
      (d) => d.name === 'mobx' || d.name === 'mobx-react' || d.name === 'mobx-react-lite'
    );
    if (mobxDep?.version) {
      // 去掉版本前缀符号（^, ~, >=）
      const rawVersion = mobxDep.version.replace(/^[\^~>=<]+/, '');
      const majorVersion = parseInt(rawVersion.split('.')[0] ?? '0', 10);
      // MobX 4/5 只有 decorator 写法；MobX 6+ 默认推荐 makeAutoObservable
      if (majorVersion < 6) return 'decorator';
      if (majorVersion >= 6) return 'makeAutoObservable';
    }

    // --- 步骤 3：fallback ---
    return 'makeAutoObservable';
  }

  /**
   * 生成状态管理内容
   */
  private generateStateManagementContent(
    context: RuleGenerationContext,
    libName?: string,
    mobxPattern: 'makeAutoObservable' | 'decorator' = 'makeAutoObservable'
  ): string {
    if (!libName) {
      return "项目使用状态管理，请遵循一致的状态更新模式。";
    }

    const lowerLib = libName.toLowerCase();

    if (lowerLib.includes("mobx")) {
      const isTS = context.techStack.languages.includes("TypeScript");

      // 动态推断 store 目录：从 deepAnalysis 中找 basename 含 store/stores 的最浅目录
      const storeDir = (() => {
        const deep = context.deepAnalysis || [];
        const storeEntries = deep.filter((d) =>
          /^store[s]?$/i.test(d.path.split('/').pop() || '')
        );
        if (storeEntries.length > 0) {
          storeEntries.sort((a, b) => a.depth - b.depth);
          return storeEntries[0].path;
        }
        return 'src/store';
      })();

      // 根据检测到的实际模式 + 是否 TypeScript 输出对应模板
      const storeExample = mobxPattern === 'makeAutoObservable'
        ? isTS
          ? `import { makeAutoObservable } from 'mobx'

interface User {
  id: string
  name: string
}

class UserStore {
  user: User | null = null
  loading: boolean = false
  error: string | null = null

  constructor() {
    makeAutoObservable(this)
  }

  setUser(user: User): void {
    this.user = user
  }

  async fetchUser(id: string): Promise<void> {
    this.loading = true
    try {
      this.user = await api.getUser(id)
    } catch (err) {
      this.error = String(err)
    } finally {
      this.loading = false
    }
  }
}`
          : `import { makeAutoObservable } from 'mobx'

class UserStore {
  user = null
  loading = false

  constructor() {
    makeAutoObservable(this)
  }

  setUser(user) {
    this.user = user
  }
}`
        : isTS
          ? `import { makeObservable, observable, action } from 'mobx'

class UserStore {
  @observable user: User | null = null

  constructor() {
    makeObservable(this)
  }

  @action
  setUser(user: User): void {
    this.user = user
  }
}`
          : `import { makeObservable, observable, action } from 'mobx'

class UserStore {
  @observable user = null

  constructor() {
    makeObservable(this)
  }

  @action
  setUser(user) {
    this.user = user
  }
}`;

      const bestPractices = mobxPattern === 'makeAutoObservable'
        ? `- 使用 makeAutoObservable 自动推断所有属性为 observable、action
- 不需要手动声明 @observable/@action（减少样板代码）
- 组件用 observer() 包装
- 避免直接修改 observable（应在 action 中修改）`
        : `- 使用 @observable 定义响应式状态
- 使用 @action 定义状态修改方法
- 组件用 observer() 包装
- 避免直接修改 observable`;

      return `## MobX 状态管理

### 项目当前使用
- 状态管理库: MobX
- Store 位置: \`${storeDir}/\`
- 使用模式: ${mobxPattern === 'makeAutoObservable' ? 'makeAutoObservable（自动推断）' : 'makeObservable + Decorators（显式声明）'}

### 使用规范

**定义 Store**:
\`\`\`typescript
${storeExample}
\`\`\`

**在组件中使用**:
\`\`\`typescript
import { observer } from 'mobx-react-lite'

export const UserProfile = observer(() => {
  const { user } = useStores()  // 获取 Store
  return <div>{user.name}</div>
})
\`\`\`

### 最佳实践

${bestPractices}

参考: 查找项目中的 Store 文件作为示例`;
    }

    if (lowerLib.includes("redux")) {
      return `## Redux 状态管理

### 使用规范

- 使用 Redux Toolkit
- Slice 按功能模块组织
- 使用 createSlice 定义 reducer
- 异步逻辑使用 createAsyncThunk

参考项目中现有的 slice 文件`;
    }

    if (lowerLib.includes("zustand")) {
      return `## Zustand 状态管理

### 使用规范

- 使用 create 创建 store
- 保持 store 扁平化
- 使用 immer 中间件处理复杂状态`;
    }

    return `## ${libName} 状态管理\n\n请遵循 ${libName} 的官方最佳实践。`;
  }

  /**
   * v1.3: 生成模块概述规则（简化版，约 200 行）
   */
  private async generateModuleOverviewRule(
    context: RuleGenerationContext,
    module: Module
  ): Promise<CursorRule> {
    const moduleOverviewGlobs = `${module.path}/**`;
    const metadata = buildRuleMetadata(
      `${module.name} 模块规则`,
      module.description || `Development conventions for the ${module.name} module`,
      50,
      context.techStack.primary,
      [module.type, "module"],
      "overview",
      ["global-rules"],
      { globs: moduleOverviewGlobs }
    );

    // 分析模块结构和业务信息
    const structureAnalysis = context.deepAnalysis
      ? this.moduleStructureAnalyzer.analyzeModuleStructure(
          module,
          context.deepAnalysis,
          context.projectPath
        )
      : null;

    const businessAnalysis = context.deepAnalysis
      ? await this.moduleBusinessAnalyzer.analyzeModuleBusiness(
          module,
          context,
          context.deepAnalysis
        )
      : null;

    let content = metadata + `\n# ${module.name} 模块\n\n`;

    // 1. 模块标识（关键信息，用于代码生成时识别目标模块）
    const packageName = module.packageName || module.name;
    const packageInfo = await this.getModulePackageInfo(module.path);
    const effectivePackageName = packageInfo?.name || packageName;
    
    content += `## 📦 模块标识\n\n`;
    content += `- **包名称**: \`${effectivePackageName}\`\n`;
    content += `- **模块名称**: \`${module.name}\`\n`;
    content += `- **模块类型**: ${getModuleTypeName(module.type)}\n`;
    if (packageInfo?.description) {
      content += `- **描述**: ${packageInfo.description}\n`;
    }
    content += `\n`;

    // 2. 模块职责
    content += `## 🎯 模块职责\n\n`;
    content += `${this.generateModuleResponsibilities(module, businessAnalysis)}\n\n`;

    // 3. 目录结构（引用 project-structure）
    content += `## 📁 目录结构\n\n`;
    content += `**MUST**: 在生成代码前，查看 @project-structure.mdc 中 \`${module.name}\` 模块的目录结构和文件夹职能说明。\n\n`;
    content += `目录结构信息位于 @project-structure.mdc，包含：\n`;
    content += `- 完整的目录树结构\n`;
    content += `- 每个目录的职能说明\n`;
    content += `- 文件组织模式和命名规范\n\n`;

    // 4. 代码生成指南
    content += `## 💻 代码生成指南\n\n`;
    content += this.generateModuleCodeGenerationGuide(module, context, structureAnalysis, businessAnalysis, effectivePackageName);

    // 5. 相关规则
    content += `## 📚 相关规则\n\n`;
    content += `参考以下全局规则：\n\n`;
    content += `- @../global-rules.mdc\n`;
    content += `- @../code-style.mdc\n`;
    content += `- @../architecture.mdc\n`;
    content += `- @../project-structure.mdc\n\n`;

    return {
      scope: "module",
      moduleName: module.name,
      modulePath: module.path,
      content,
      fileName: `${sanitizeFileName(module.name)}-overview.mdc`,
      priority: 50,
      type: "overview",
      depends: ["global-rules"],
    };
  }

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
   * 评估深度分析数据的质量
   */
  /**
   * 生成基于项目配置的代码风格规则（v1.2）
   */
  generateConfigBasedStyleRules(context: RuleGenerationContext): string {
    if (!context.projectConfig) {
      return this.generateCodeStyleGuidelines(context);
    }

    let rules = `## 代码风格（基于项目配置）\n\n`;

    // 使用项目实际配置
    if (context.projectConfig.prettier) {
      const p = context.projectConfig.prettier;
      rules += `### 项目配置 (Prettier)\n\n`;
      rules += `项目使用 Prettier 进行代码格式化，配置如下：\n\n`;
      rules += `- **缩进**: ${
        p.useTabs ? "Tab" : `${p.tabWidth || 2} 个空格`
      }\n`;
      rules += `- **引号**: ${p.singleQuote ? "单引号" : "双引号"}\n`;
      rules += `- **分号**: ${p.semi ? "使用分号" : "不使用分号"}\n`;
      rules += `- **行长度**: ${p.printWidth || 80} 字符\n`;
      rules += `- **尾随逗号**: ${p.trailingComma || "none"}\n\n`;
      rules += `**配置文件**: @.prettierrc\n\n`;

      rules += `### 代码格式化要求\n\n`;
      rules += `生成代码时遵循上述 Prettier 配置：\n`;
      rules += `- 使用${p.singleQuote ? "单引号" : "双引号"}包裹字符串\n`;
      rules += `- 使用 ${
        p.useTabs ? "Tab" : `${p.tabWidth || 2} 个空格`
      }缩进\n`;
      rules += `- ${p.semi ? "添加" : "不添加"}分号\n\n`;
    } else if (context.projectPractice?.codeStyle) {
      // 使用分析出的代码风格：仅输出能明确判定的项，"mixed"/不确定的项一律省略，
      // 避免产出对 AI 无指导价值的「混合」占位内容（置信度闸门）
      const style = context.projectPractice.codeStyle;
      const isTS = context.techStack.languages.includes("TypeScript");
      const styleLines: string[] = [];

      // TypeScript/modern JS 项目不可能以 var 为主，若检测为 var 优先纠正为 const/let
      if (style.variableDeclaration === "const-let") {
        styleLines.push(`- **变量声明**: 使用 const/let`);
      } else if (style.variableDeclaration === "var") {
        styleLines.push(
          isTS ? `- **变量声明**: 使用 const/let` : `- **变量声明**: 使用 var`
        );
      }

      if (style.functionStyle === "arrow") {
        styleLines.push(`- **函数风格**: 箭头函数`);
      } else if (style.functionStyle === "function") {
        styleLines.push(`- **函数风格**: function 声明`);
      }

      if (style.stringQuote === "single") {
        styleLines.push(`- **字符串引号**: 单引号`);
      } else if (style.stringQuote === "double") {
        styleLines.push(`- **字符串引号**: 双引号`);
      } else if (style.stringQuote === "backtick") {
        styleLines.push(`- **字符串引号**: 模板字符串`);
      }

      if (style.semicolon === "always") {
        styleLines.push(`- **分号**: 使用`);
      } else if (style.semicolon === "never") {
        styleLines.push(`- **分号**: 不使用`);
      }

      if (styleLines.length > 0) {
        rules += `### 项目当前实践（分析得出）\n\n`;
        rules += `生成代码时保持与现有代码一致的风格：\n\n`;
        rules += styleLines.join("\n") + "\n\n";
      }
    }

    // ESLint 配置说明（只描述工具存在，不重复输出命令）
    if (context.projectConfig.eslint || context.projectConfig.commands?.lint) {
      rules += `### ESLint 代码检查\n\n`;
      if (context.projectConfig.eslint) {
        rules += `项目使用 ESLint 进行代码质量检查。\n\n`;
        rules += `**配置文件**: @.eslintrc\n\n`;
      }
      // 命令由下方「代码生成后标准流程」统一输出，此处不重复
    }

    // 代码生成后必须运行的命令（唯一输出命令的位置）
    // 仅在存在实际命令时输出，作为对 AI 的约束，而非面向用户的交互提示
    if (context.projectConfig.commands) {
      const steps: string[] = [];
      if (context.projectConfig.commands.format) {
        steps.push(`# 格式化代码\n${context.projectConfig.commands.format}`);
      }
      if (context.projectConfig.commands.lintFix) {
        steps.push(`# 修复 lint 问题\n${context.projectConfig.commands.lintFix}`);
      } else if (context.projectConfig.commands.lint) {
        steps.push(`# 检查 lint\n${context.projectConfig.commands.lint}`);
      }
      if (context.projectConfig.commands.typeCheck) {
        steps.push(`# 类型检查\n${context.projectConfig.commands.typeCheck}`);
      }

      if (steps.length > 0) {
        rules += `### 代码生成后必须运行\n\n`;
        rules += `\`\`\`bash\n`;
        rules += steps.join("\n\n");
        rules += `\n\`\`\`\n\n`;
      }
    }

    // 添加路径别名信息
    if (
      context.projectConfig?.pathAliases &&
      Object.keys(context.projectConfig.pathAliases).length > 0
    ) {
      rules += `### 路径别名（必须使用）\n\n`;
      rules += `项目配置了以下路径别名，生成代码时必须使用：\n\n`;
      for (const [alias, target] of Object.entries(
        context.projectConfig.pathAliases
      )) {
        rules += `- \`${alias}\` → \`${target}\`\n`;
      }
      rules += `\n示例：\n`;
      rules += `\`\`\`typescript\n`;
      const firstAlias = Object.keys(context.projectConfig.pathAliases)[0];
      rules += `// ✅ 正确 - 使用路径别名\n`;
      rules += `import { Component } from '${firstAlias}/Component';\n\n`;
      rules += `// ❌ 错误 - 不要使用相对路径\n`;
      rules += `import { Component } from '../../../Component';\n`;
      rules += `\`\`\`\n\n`;
    }

    return rules;
  }

  /**
   * 生成自定义工具使用规则（v1.2）
   */
  generateCustomToolsRules(context: RuleGenerationContext): string {
    if (
      !context.customPatterns ||
      ((!context.customPatterns.customHooks || context.customPatterns.customHooks.length === 0) &&
        (!context.customPatterns.customUtils || context.customPatterns.customUtils.length === 0))
    ) {
      return "";
    }

    let rules = `## 项目自定义工具（优先使用）\n\n`;

    // 自定义 Hooks：按频率分层输出
    if (context.customPatterns.customHooks && context.customPatterns.customHooks.length > 0) {
      rules += `### 自定义 Hooks\n\n`;
      rules += `项目定义了以下自定义 hooks，**生成代码时必须优先使用**：\n\n`;

      const activeHooks = context.customPatterns.customHooks
        .filter((h) => h.frequency > 0)
        .slice(0, 10);

      if (activeHooks.length === 0) {
        rules += `> 项目中的自定义 hooks 尚未检测到使用记录，请参考 @project-structure.mdc 确认 hooks 目录位置。\n\n`;
      }

      for (const hook of activeHooks) {
        // 按频率分层：高(>10) = 强制优先；中(4-10) = 优先使用；低(1-3) = 可选参考
        const freqLabel = hook.frequency > 10 ? "高" : hook.frequency > 3 ? "中" : "低";
        const freqNote = hook.frequency <= 3
          ? ` ⚠️ 低频（仅 ${hook.frequency} 处使用，仅在明确匹配使用场景时优先）`
          : ` (${hook.frequency} 处)`;

        rules += `**${hook.name}** ${hook.description ? `- ${hook.description}` : ""}\n`;
        rules += `- 位置: \`${hook.relativePath}\`\n`;
        rules += `- 使用频率: ${freqLabel}${freqNote}\n`;
        if (hook.usage) {
          rules += `- 使用方式:\n`;
          rules += `  \`\`\`typescript\n`;
          rules += `  ${hook.usage}\n`;
          rules += `  \`\`\`\n`;
        }
        rules += `\n`;
      }
    }

    // 自定义工具函数：同名函数标注上下文容器，由 Agent 在调用点按就近原则决策
    if (context.customPatterns.customUtils && context.customPatterns.customUtils.length > 0) {
      rules += `### 自定义工具函数\n\n`;
      rules += `项目定义了以下工具函数，**生成代码时必须优先使用**：\n\n`;

      // 收集项目依赖名称，用于识别路径中是否包含已知子库段
      const depNames = new Set(
        (context.techStack.dependencies ?? []).map((d) => d.name.toLowerCase())
      );

      const utilsByCategory = this.groupUtilsByCategory(context.customPatterns.customUtils);

      for (const [category, utils] of Object.entries(utilsByCategory)) {
        rules += `**${category}**:\n`;

        // 分组同名函数
        const nameGroups: Record<string, any[]> = {};
        for (const u of utils) {
          if (!nameGroups[u.name]) nameGroups[u.name] = [];
          nameGroups[u.name].push(u);
        }

        const processedNames = new Set<string>();
        for (const util of utils.slice(0, 5)) {
          if (processedNames.has(util.name)) continue;
          processedNames.add(util.name);

          const group = nameGroups[util.name];
          if (group.length > 1) {
            // 同名函数：不排序，如实标注每个定义所属的上下文容器
            // 由 Agent 在生成代码时按调用点就近原则选择正确版本
            rules += `- \`${util.name}\` — **多处定义，按调用位置就近选择**：\n`;
            for (const g of group) {
              const label = this.inferContextLabel(g.relativePath, depNames);
              rules += `  - \`${g.relativePath}\` — ${label}\n`;
              if (g.signature) {
                rules += `    \`\`\`typescript\n    ${g.signature}\n    \`\`\`\n`;
              }
            }
          } else {
            rules += `- \`${util.name}\` (${util.relativePath})\n`;
            if (util.signature) {
              rules += `  \`\`\`typescript\n  ${util.signature}\n  \`\`\`\n`;
            }
          }
        }
        rules += `\n`;
      }
    }

    // API 客户端
    const api = context.customPatterns.apiClient;
    if (api?.exists && api.filePath) {
      rules += `### API 客户端\n\n`;
      rules += `项目使用自定义的 API 客户端：**\`${api.name}\`**\n`;
      rules += `- 位置: \`${FileUtils.getRelativePath(
        context.projectPath,
        api.filePath
      )}\`\n`;
      if (api.hasErrorHandling) {
        rules += `- ✅ 已内置错误处理\n`;
      }
      if (api.hasAuth) {
        rules += `- ✅ 已内置认证处理\n`;
      }
      rules += `\n**使用要求**:\n`;
      rules += `\`\`\`typescript\n`;
      rules += `// ✅ 正确 - 使用项目的 API 客户端\n`;
      rules += `import { ${api.name} } from '@/services/${api.name}';\n`;
      rules += `const data = await ${api.name}.get('/endpoint');\n\n`;
      rules += `// ❌ 错误 - 不要直接使用 fetch 或 axios\n`;
      rules += `const response = await fetch('/api/endpoint');\n`;
      rules += `\`\`\`\n\n`;
    }

    rules += `### ⚠️ 重要规则\n\n`;
    rules += `1. **优先使用项目自定义工具**，不要重新实现或引入第三方替代\n`;
    rules += `2. **保持一致性**，使用相同的工具确保代码可维护性\n`;
    rules += `3. **新增工具时**，遵循现有工具的命名和组织方式\n\n`;

    return rules;
  }

  /**
   * 按类别分组工具函数
   */
  private groupUtilsByCategory(utils: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    for (const util of utils) {
      if (!grouped[util.category]) {
        grouped[util.category] = [];
      }
      grouped[util.category].push(util);
    }
    return grouped;
  }

  /**
   * 推断路径所属的上下文容器标签，用于同名函数的多处定义标注。
   *
   * 判断依据（按优先级）：
   * 1. 路径中某段与已知依赖名匹配 → 识别为该依赖的子库
   * 2. 路径中存在 vendor / third-party 等惯用段 → 外部库
   * 3. 路径中的 feature / module 级目录名 → 业务模块
   * 4. 其余情况 → 主项目
   *
   * 注意：此方法只做上下文描述，不做优先级排序。
   * 优先级由 Agent 在生成代码时根据调用点就近决策。
   */
  private inferContextLabel(relativePath: string, depNames: Set<string>): string {
    const segments = relativePath.split('/').map((s) => s.toLowerCase());

    // 1. 路径中某段命中已知依赖名 → 子库
    for (const seg of segments) {
      if (depNames.has(seg)) {
        return `${seg} 子库`;
      }
    }

    // 2. 惯用的外部/vendored 路径段
    const VENDOR_SEGMENTS = new Set(['vendor', 'third-party', 'thirdparty', 'external']);
    for (const seg of segments) {
      if (VENDOR_SEGMENTS.has(seg)) {
        return `外部库（${seg}/）`;
      }
    }

    // 3. 识别 feature / module 业务级目录（非根级 src/）
    const FEATURE_SEGMENTS = new Set(['features', 'modules', 'pages', 'views', 'domains']);
    for (let i = 0; i < segments.length - 1; i++) {
      if (FEATURE_SEGMENTS.has(segments[i])) {
        return `${segments[i + 1]} 模块`;
      }
    }

    // 4. 默认：主项目
    return '主项目';
  }

}
