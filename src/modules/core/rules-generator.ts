import * as path from 'path';

import {
    BestPractice, CodeFeature, CursorRule, Module, RuleGenerationContext,
    TechStack
} from '../../types.js';
import { FileUtils } from '../../utils/file-utils.js';
import { logger } from '../../utils/logger.js';
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

/**
 * 职能文件夹关键词（用于区分职能目录与业务目录）
 *
 * 这些词代表项目按"职能/技术职责"组织的目录（如 components、utils、api 等），
 * 与业务名词（如 user、order、checkout）形成对照。
 *
 * 单一来源：之前在 `isBusinessFolder` 和 `generateDirectoryPurposes` 中各自维护
 * 一份相同的列表，现统一到模块级常量，避免漂移。
 */
const FUNCTIONAL_FOLDER_KEYWORDS = [
  // 组件和页面容器（职能层）
  'component', 'components', 'cmp',
  'page', 'pages', 'view', 'views',
  // Hooks 和工具
  'hook', 'hooks',
  'util', 'utils', 'utilities', 'helper', 'helpers',
  // API 和服务
  'api', 'apis', 'service', 'services',
  // 类型和模型
  'type', 'types', 'interface', 'interfaces',
  'model', 'models', 'entity', 'entities',
  'dto', 'dao', 'schema', 'schemas',
  // 状态管理
  'store', 'stores', 'state',
  // 样式
  'style', 'styles', 'css', 'scss', 'sass', 'less',
  // 配置
  'config', 'configs', 'configuration',
  // 测试
  'test', 'tests', '__tests__', '__mocks__', 'mock', 'mocks',
  // 功能模块
  'feature', 'features', 'module', 'modules',
  // 共享和公共
  'shared', 'common', 'lib', 'libs', 'library',
  // 路由
  'route', 'routes', 'router',
  // 后端相关
  'middleware', 'controller', 'controllers',
  'repository', 'repositories',
  'guard', 'guards', 'interceptor', 'interceptors',
  'pipe', 'pipes', 'filter', 'filters',
  'decorator', 'decorators',
  // 布局
  'layout', 'layouts',
  // 常量
  'constant', 'constants', 'enum', 'enums',
  // 验证和格式化
  'validator', 'validators', 'formatter', 'formatters',
  // 适配器
  'adapter', 'adapters',
  // 提供者
  'provider', 'providers', 'factory', 'factories',
  // 策略
  'strategy', 'strategies',
  // 数据库相关
  'migration', 'migrations', 'seed', 'seeds',
  // 资源
  'asset', 'assets', 'static', 'public',
  // 国际化
  'locale', 'locales', 'i18n',
  // 主题
  'theme', 'themes',
  // 模板
  'template', 'templates', 'partial', 'partials',
  // 容器
  'container', 'containers',
  // 架构层
  'presentation', 'presentations', 'domain', 'domains',
  'infrastructure', 'infrastructures', 'application', 'applications',
  // 核心
  'core', 'kernel', 'base', 'bases',
  // 内部和外部
  'internal', 'internals', 'external', 'externals',
  // 第三方
  'vendor', 'vendors', 'third-party', 'thirdparties',
  // 插件和扩展
  'plugin', 'plugins', 'extension', 'extensions',
  // 工具和脚本
  'tool', 'tools', 'script', 'scripts',
  // 构建输出
  'bin', 'build', 'dist', 'out',
  // 文档
  'doc', 'docs', 'documentation',
  // 示例
  'example', 'examples', 'demo', 'demos', 'sample', 'samples',
] as const;

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
      projectStructureRule = await this.generateProjectStructureRule(context);
    } catch (error) {
      logger.error("生成项目结构规则失败，使用简化版本", error);
      // 生成一个最小化的项目结构规则，确保文件总是被创建
      projectStructureRule = this.generateFallbackProjectStructureRule(context);
    }
    rules.push(projectStructureRule);

    // 4. 项目架构规则（必需，约 200 行，已移除结构相关内容）
    const architectureRule = this.generateArchitectureRule(
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
      const errorHandlingRule = this.generateErrorHandlingRule(
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
      this.isFrontendProject(context);
    if (needsUIUX) {
      const uiUxRule = this.generateUIUXRule(context);
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
        const frontendRoutingRule = this.generateFrontendRoutingRule(context);
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
        const backendRoutingRule = this.generateBackendRoutingRule(context);
        rules.push(backendRoutingRule);
      }
    }

    // 11. 测试规则：仅在有测试框架或显式测试需求时生成（无框架 = 跳过，不生成空文件）
    const needsTesting = requirements.some((r) => r.ruleType === "testing");
    const hasTestingFeature = this.featureExists(context, "testing");
    const hasTestFramework = this.detectTestFramework(context) !== null;
    const isFrontend = this.isFrontendProject(context);
    if (needsTesting || hasTestingFeature || hasTestFramework) {
      const testingRule = this.generateTestingRule(context);
      rules.push(testingRule);
    }

    // 11b. API Patterns（前端项目有 axios 或自定义 apiClient 时生成）
    const hasApiClient = context.customPatterns?.apiClient?.exists;
    const hasAxiosDep = context.techStack.dependencies.some((d) => d.name === "axios");
    if (isFrontend && (hasApiClient || hasAxiosDep)) {
      const apiPatternsRule = this.generateApiPatternsRule(context);
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
   * 生成 post-coding 约束行（global-rules Hard Constraints 末尾）
   */
  private generatePostCodingConstraint(context: RuleGenerationContext): string {
    const cmds = context.projectConfig?.commands;
    const parts: string[] = [];
    if (cmds?.lint || cmds?.lintFix) parts.push(`\`${cmds.lintFix ?? cmds.lint}\``);
    // typeCheck 已在 config-parser 层通过命令值判断排除复合命令，展示侧直接使用
    if (cmds?.typeCheck) parts.push(`\`${cmds.typeCheck}\``);
    if (parts.length === 0) return '';
    return `- After writing code, run ${parts.join(' and ')} before considering the task complete.`;
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
    return this.featureExists(context, "state-management");
  }

  /**
   * v1.3: 生成全局概述规则（约 280 行）
   */
  private generateGlobalOverviewRule(
    context: RuleGenerationContext
  ): CursorRule {
    const metadata = this.generateRuleMetadata(
      `${this.getProjectName(context.projectPath)} - 全局规则`,
      "Project-wide conventions, tech stack, and core development principles. Always loaded.",
      100,
      context.techStack.primary,
      ["global", "overview"],
      "overview",
      undefined,
      { alwaysApply: true }
    );

    const persona = this.generatePersona(context);

    const techVersions = this.generateVersionedTechStack(context);
    const commandsSection = this.generateCommandsSection(context);

    const content =
      metadata +
      `# ${this.getProjectName(context.projectPath)}

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
${this.generatePostCodingConstraint(context)}
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
${this.hasCustomTools(context) ? "| @custom-tools.mdc | Project-specific hooks, utils, API clients |\n" : ""}${this.hasErrorHandling(context) ? "| @error-handling.mdc | Error handling and logging patterns |\n" : ""}${this.hasStateManagement(context) ? "| @state-management.mdc | State management conventions |\n" : ""}${context.frontendRouter ? "| @frontend-routing.mdc | Frontend routing patterns |\n" : ""}${context.backendRouter ? "| @api-routing.mdc | API endpoint conventions |\n" : ""}${this.isFrontendProject(context) ? "| @ui-ux.mdc | UI component and UX patterns |\n" : ""}${(this.isFrontendProject(context) && (context.customPatterns?.apiClient?.exists || context.techStack.dependencies.some((d) => d.name === "axios"))) ? "| @api-patterns.mdc | API call conventions and HTTP client usage |\n" : ""}${this.isFrontendProject(context) ? "| @feature-recipe.mdc | End-to-end guide for adding a new feature |\n" : ""}${(this.featureExists(context, "testing") || this.detectTestFramework(context) !== null) ? "| @testing.mdc | Testing patterns and organization |\n" : ""}
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
    const langGlobs = this.getLanguageGlobs(context);
    const metadata = this.generateRuleMetadata(
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
    const additionalPractices = this.formatMissingPractices(codeStylePractices);

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
   * v1.8: 生成项目结构规则（独立文件，约 300 行）
   * 包含完整的目录结构、职能说明、文件组织规范
   * 
   * 如果 context 中的 deepAnalysis 数据不完整，会尝试重新获取
   */
  private async generateProjectStructureRule(
    context: RuleGenerationContext
  ): Promise<CursorRule> {
    // 检查并确保有完整的 deepAnalysis 数据
    await this.ensureDeepAnalysisData(context);
    
    const indexGlobs = "**/index.{ts,tsx,js,jsx}";
    const metadata = this.generateRuleMetadata(
      "项目结构",
      "Consult when creating new files or directories to determine correct location and naming conventions",
      85,
      context.techStack.primary,
      ["structure", "directory", "file-organization"],
      "reference",
      ["global-rules"],
      { globs: indexGlobs }
    );

    const content =
      metadata +
      `
# 项目结构

参考: @global-rules.mdc

${this.generateDetailedStructureContent(context)}

---
*新建文件前，请参考此文件确定正确的目录位置和命名规范。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "project-structure.mdc",
      priority: 85,
      type: "reference",
      depends: ["global-rules"],
    };
  }

  /**
   * 生成备用项目结构规则（当主生成方法失败时使用）
   * 确保 project-structure.mdc 文件总是被创建
   */
  private generateFallbackProjectStructureRule(
    context: RuleGenerationContext
  ): CursorRule {
    const metadata = this.generateRuleMetadata(
      "项目结构",
      "Consult when creating new files or directories to determine correct location and naming conventions",
      85,
      context.techStack.primary,
      ["structure", "directory", "file-organization"],
      "reference",
      ["global-rules"]
    );

    let content = metadata + `
# 项目结构

参考: @global-rules.mdc

> ⚠️ **注意**: 由于分析过程中遇到问题，以下为简化版项目结构说明。建议重新运行 \`generate_cursor_rules\` 以获取完整的目录树和职能说明。

## 📁 目录结构树

项目目录结构分析暂时不可用。请参考项目的实际目录结构。

`;

    // 尝试使用 fileOrganization 生成简化结构
    if (context.fileOrganization && context.fileOrganization.structure.length > 0) {
      content += `## 🎯 文件组织规范（快速参考）\n\n`;
      content += `以下是常见文件类型的存放位置：\n\n`;
      content += this.generateFileOrganizationRules(context);
      content += `\n`;
    } else {
      // 如果连 fileOrganization 都没有，生成最基础的指南
      content += `## 🎯 文件组织规范\n\n`;
      content += `项目文件组织规范待补充。建议：\n\n`;
      content += `- 组件文件放在 \`src/components/\` 或类似目录\n`;
      content += `- 工具函数放在 \`src/utils/\` 或类似目录\n`;
      content += `- 类型定义放在 \`src/types/\` 或类似目录\n`;
      content += `- API 相关文件放在 \`src/api/\` 或类似目录\n\n`;
    }

    // 添加新建文件指南
    content += `## ✨ 新建文件指南\n\n`;
    content += this.generateNewFileGuidelines(context);
    content += `\n`;

    content += `---
*新建文件前，请参考此文件确定正确的目录位置和命名规范。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "project-structure.mdc",
      priority: 85,
      type: "reference",
      depends: ["global-rules"],
    };
  }

  /**
   * 确保有完整的深度分析数据
   * 如果数据缺失或不完整，尝试重新获取
   */
  private async ensureDeepAnalysisData(
    context: RuleGenerationContext
  ): Promise<void> {
    // 评估当前数据质量
    const quality = this.assessDeepAnalysisQuality(context.deepAnalysis);
    
    // 如果数据完整且质量良好，直接返回
    if (quality.quality === "good") {
      logger.info("深度分析数据质量良好，无需重新获取");
      return;
    }
    
    // 如果数据缺失或质量差，尝试重新获取
    logger.warn(`深度分析数据质量: ${quality.quality}，原因: ${quality.reason}`);
    logger.info("尝试重新获取完整的深度分析数据...");
    
    try {
      // 动态导入 DeepDirectoryAnalyzer
      const { DeepDirectoryAnalyzer } = await import("../analyzers/deep-directory-analyzer.js");
      const { ProjectAnalyzer } = await import("./project-analyzer.js");
      
      // 优先使用 context 中保存的文件列表
      let files: string[] = context.files || [];
      
      // 如果 context 中没有文件列表，重新收集
      if (files.length === 0) {
        logger.info("context 中未保存文件列表，重新收集...");
        const projectAnalyzer = new ProjectAnalyzer();
        files = await projectAnalyzer.collectFiles(context.projectPath);
        logger.info(`重新收集文件: ${files.length} 个`);
      } else {
        logger.info(`使用 context 中的文件列表: ${files.length} 个`);
      }
      
      // 验证文件列表不为空
      if (files.length === 0) {
        logger.error("文件列表为空，无法执行深度分析");
        return;
      }
      
      // 创建深度分析器并重新分析
      const deepAnalyzer = new DeepDirectoryAnalyzer();
      
      // 设置依赖信息（保持完整的 Dependency 类型）
      const dependencies = context.techStack.dependencies.map((d) => ({
        name: d.name,
        version: d.version,
        type: d.type || ("dependency" as const),
        category: d.category,
      }));
      await deepAnalyzer.setDependencies(dependencies);
      
      // 执行深度分析
      const newDeepAnalysis = await deepAnalyzer.analyzeProjectStructure(
        context.projectPath,
        files,
        context.modules || [],
        dependencies
      );
      
      logger.info(`重新获取深度分析数据: ${newDeepAnalysis.length} 个目录`);
      
      // 更新 context
      context.deepAnalysis = newDeepAnalysis;
      
      // 重新识别架构模式
      if (newDeepAnalysis.length > 0) {
        context.architecturePattern = await deepAnalyzer.identifyArchitecturePattern(
          newDeepAnalysis,
          context.projectPath,
          files
        );
        logger.info(`重新识别架构模式: ${context.architecturePattern.type}`);
      }
      
      // 再次评估质量
      const newQuality = this.assessDeepAnalysisQuality(context.deepAnalysis);
      logger.info(`重新获取后的数据质量: ${newQuality.quality}`);
      
      if (newQuality.quality === "missing" || newQuality.quality === "poor") {
        logger.error("重新获取后数据质量仍然不佳，将使用简化版结构");
      }
    } catch (error) {
      logger.error("重新获取深度分析数据失败", error);
      // 失败后继续使用原有数据（可能是简化版）
    }
  }

  /**
   * 生成详细的项目结构内容（优化版：完整的目录树和职能说明）
   */
  private generateDetailedStructureContent(
    context: RuleGenerationContext
  ): string {
    let content = "";

    // 检查深度分析数据的完整性（安全处理 undefined）
    const deepAnalysis = context.deepAnalysis || [];
    const hasDeepAnalysis = deepAnalysis.length > 0;
    const deepAnalysisQuality = this.assessDeepAnalysisQuality(deepAnalysis);

    // 1. 目录结构树（完整树形结构，优先显示）
    // 使用与 test-report 相同的生成逻辑，确保完整性和一致性
    if (hasDeepAnalysis) {
      content += `## 📁 目录结构树\n\n`;
      
      // 如果数据质量不佳，添加警告提示
      if (deepAnalysisQuality.isIncomplete) {
        content += `> ⚠️ **注意**: 目录结构分析可能不完整（${deepAnalysisQuality.reason}），建议重新生成以获取完整结构。\n\n`;
      }
      
      content += `项目主要目录结构：\n\n`;
      content += this.generateDirectoryTree(deepAnalysis);
      content += `\n`;
    } else {
      // 如果没有深度分析结果，使用 fileOrganization 生成简化结构
        content += `## 📁 目录结构树\n\n`;
      content += `> ⚠️ **警告**: 未能获取完整的目录深度分析数据，以下为简化版结构。建议重新运行 \`generate_cursor_rules\` 以获取完整的目录树和职能说明。\n\n`;
      
      if (context.fileOrganization && context.fileOrganization.structure.length > 0) {
        content += `项目主要目录结构（简化版）：\n\n`;
        content += this.generateSimplifiedDirectoryTree(context.fileOrganization);
        content += `\n`;
      } else {
        content += `> ❌ **错误**: 无法生成目录结构，请检查项目路径和文件权限。\n\n`;
      }
    }

    // 3. 主要目录职能说明（详细说明，重要目录）
    if (hasDeepAnalysis) {
      content += `## 📋 主要目录职能说明\n\n`;
      content += `以下是重要目录的详细职能说明，包含文件类型、命名规范等信息：\n\n`;
      content += this.generateDirectoryPurposes(deepAnalysis);
      content += `\n`;
    } else {
      // 如果没有深度分析，跳过职能说明章节
      content += `> ℹ️ **提示**: 由于缺少深度分析数据，无法生成详细的目录职能说明。\n\n`;
    }

    // 4. 文件组织规范（快速参考）
    if (context.fileOrganization) {
      content += `## 🎯 文件组织规范（快速参考）\n\n`;
      content += `以下是常见文件类型的存放位置，用于快速查找：\n\n`;
      content += this.generateFileOrganizationRules(context);
      content += `\n`;
    }

    // 5. 新建文件指南
    content += `## ✨ 新建文件指南\n\n`;
    content += this.generateNewFileGuidelines(context);
    content += `\n`;

    return content;
  }

  /**
   * 生成简化的目录树（基于 fileOrganization）
   */
  private generateSimplifiedDirectoryTree(fileOrg: any): string {
    const tree: string[] = [];
    const structure = fileOrg.structure || [];
    
    // 按路径深度排序
    const sorted = [...structure].sort((a: any, b: any) => {
      const aDepth = a.path.split("/").length;
      const bDepth = b.path.split("/").length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.path.localeCompare(b.path);
    });

    // 只显示前 3 层
    const maxDepth = 3;
    const filtered = sorted.filter((d: any) => {
      const depth = d.path.split("/").length;
      return depth <= maxDepth;
    });

    for (const dir of filtered) {
      const depth = dir.path.split("/").length;
      const indent = "  ".repeat(depth - 1);
      const prefix = depth > 1 ? "├── " : "";
      const fileCount = dir.fileCount > 0 ? ` (${dir.fileCount} 个文件)` : "";
      tree.push(
        `${indent}${prefix}${dir.path}/  # ${dir.purpose || "目录"}${fileCount}`
      );
    }

    return `\`\`\`\n${tree.join("\n")}\n\`\`\`\n\n`;
  }

  /**
   * 生成目录树结构（完整版，包含所有目录层级）
   * 使用与 test-report 逻辑完全一致，但确保显示完整的目录树
   */
  private generateDirectoryTree(
    deepAnalysis: any[]
  ): string {
    if (deepAnalysis.length === 0) {
      return "```text\n项目目录结构分析中...\n```\n\n";
    }

    // 按层级组织目录（与 test-report 完全一致的逻辑）
    const tree: string[] = [];
    
    // 找到根目录 (depth === 1)，与 test-report 保持一致
    const rootDirs = deepAnalysis.filter((d) => d.depth === 1);
    
    // 恢复排序逻辑，确保与 test-report 一致（test-report 是按字母排序的）
    rootDirs.sort((a, b) => {
      const aName = path.basename(a.path);
      const bName = path.basename(b.path);
      return aName.localeCompare(bName);
    });

    // 纯样式/资源目录：深度限制为 2（避免 styles/antd/xxx 等深链条）
    const SHALLOW_DIRS = new Set(['styles', 'style', 'assets', 'images', 'icons', 'fonts', 'public', 'static']);

    const buildTree = (
      dir: any,
      prefix: string,
      isLast: boolean,
      currentDepth = 1
    ) => {
      const connector = isLast ? "└── " : "├── ";
      const dirName = path.basename(dir.path);

      // 样式/资源目录折叠深度限制为 2
      const parentName = path.basename(dir.path.split('/').slice(0, -1).join('/') || '');
      const isUnderShallowDir = SHALLOW_DIRS.has(parentName.toLowerCase());
      const maxDepth = isUnderShallowDir ? 2 : 4;

      // 超过最大深度时折叠
      if (currentDepth > maxDepth) {
        tree.push(`${prefix}${connector}${dirName}/`);
        return;
      }

      // 找到所有子目录
      const children = deepAnalysis.filter(
        (d) => d.parentDirectory === dir.path
      );
      
      // 分离职能子目录和业务子目录
      const functionalChildren = children.filter(child => 
        !this.isBusinessFolder(child, deepAnalysis)
      );
      const businessChildren = children.filter(child => 
        this.isBusinessFolder(child, deepAnalysis)
      );
      
      // 如果有业务子目录，显示为折叠形式
      if (businessChildren.length > 0 && functionalChildren.length === 0) {
        // 只有业务子目录，显示为 ... (N个业务文件夹)
        // 只判断英文，不判断中文
        const purposeLower = (dir.purpose || '').toLowerCase();
        const hasValidPurpose = dir.purpose && 
                                dir.purpose !== "" && 
                                purposeLower !== 'other' && 
                                purposeLower !== 'unknown';
        const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";
        tree.push(`${prefix}${connector}${dirName}/ ... (${businessChildren.length}个业务文件夹)${purpose}`);
        return; // 不展开业务文件夹
      }
      
      // 如果有职能子目录，正常显示
      if (functionalChildren.length > 0) {
        // 只判断英文，不判断中文
        const purposeLower = (dir.purpose || '').toLowerCase();
        const hasValidPurpose = dir.purpose && 
                                dir.purpose !== "" && 
                                purposeLower !== 'other' && 
                                purposeLower !== 'unknown';
        const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";
        tree.push(`${prefix}${connector}${dirName}/${purpose}`);
        
        // 只递归处理职能子目录
        functionalChildren.sort((a, b) => {
        const aName = path.basename(a.path);
        const bName = path.basename(b.path);
        return aName.localeCompare(bName);
      });

        functionalChildren.forEach((child, index) => {
          const isLastChild = index === functionalChildren.length - 1 && businessChildren.length === 0;
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        buildTree(child, childPrefix, isLastChild, currentDepth + 1);
      });
        
        // 如果有业务子目录，在最后显示折叠提示
        if (businessChildren.length > 0) {
          const businessPrefix = prefix + (isLast ? "    " : "│   ");
          tree.push(`${businessPrefix}└── ... (${businessChildren.length}个业务文件夹)`);
        }
      } else {
        // 没有子目录，正常显示
        // 只判断英文，不判断中文
        const purposeLower = (dir.purpose || '').toLowerCase();
        const hasValidPurpose = dir.purpose && 
                                dir.purpose !== "" && 
                                purposeLower !== 'other' && 
                                purposeLower !== 'unknown';
        const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";
        tree.push(`${prefix}${connector}${dirName}/${purpose}`);
      }
    };

    // 构建所有根目录的树（确保所有根目录都被包含）
    rootDirs.forEach((dir, index) => {
      buildTree(dir, "", index === rootDirs.length - 1);
    });

    // 检查是否有遗漏的目录（没有父目录且不是根目录）
    const orphanDirs = deepAnalysis.filter(
      (d) => d.depth > 1 && !deepAnalysis.some((parent) => parent.path === d.parentDirectory)
    );
    
    if (orphanDirs.length > 0) {
      tree.push("\n# 其他目录（未分类）");
      orphanDirs.forEach((dir) => {
        const dirName = path.basename(dir.path);
        // 只判断英文，不判断中文
        const purposeLower = (dir.purpose || '').toLowerCase();
        const hasValidPurpose = dir.purpose && 
                                dir.purpose !== "" && 
                                purposeLower !== 'other' && 
                                purposeLower !== 'unknown';
        const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";
        tree.push(`├── ${dirName}/${purpose}`);
      });
    }

    // 返回带代码块的格式（使用 text 类型以保持纯文本显示）
    return `\`\`\`text\n${tree.join("\n")}\n\`\`\`\n\n`;
  }

  /**
   * 判断目录是否为业务性文件夹（需要过滤掉）
   * 
   * 判断标准：
   * 1. purpose 包含业务性或非类别或非职能关键词列表内的词汇
   *    例如："payment page"、"payment component"（包含业务词汇）
   *    而不是单纯的"page"、"component"（纯职能关键词）
   * 2. 同级下有其他带有业务性词汇，但属于同类别的文件夹
   *    例如：component 下的 "Auth"、"Loading"、"ErrorBoundary"
   *    pages 下的 "case-center"、"apply-access"、"insurance"
   * 3. 其他无法识别类别或无法匹配职能关键词列表的文件夹
   */
  private isBusinessFolder(dir: any, deepAnalysis: any[]): boolean {
    const functionalFolderKeywords = FUNCTIONAL_FOLDER_KEYWORDS;

    // 优先检查目录名：如果目录名本身是强职能关键词，直接认定为职能文件夹（非业务）
    // 这可以防止因 purpose 描述不准确（如包含中文）导致的误判
    const dirName = path.basename(dir.path).toLowerCase();
    // 完全匹配或常见的复数形式
    const isExactFunctionalName = functionalFolderKeywords.some(keyword => 
      dirName === keyword
    );
    
    if (isExactFunctionalName) {
      return false;
    }

    // 标准1: purpose 包含业务性词汇
    if (dir.purpose) {
      const purpose = dir.purpose.toLowerCase();
      
      // 纯职能关键词列表（英文），用于判断 purpose 是否为纯职能描述
      // 如果 purpose 只包含这些关键词，说明是纯职能，不是业务性
      const pureFunctionalKeywords = [
        // 组件和页面
        'page', 'pages', 'component', 'components', 'view', 'views',
        // Hooks 和工具
        'hook', 'hooks', 'util', 'utils', 'utilities', 'helper', 'helpers',
        // API 和服务
        'api', 'apis', 'service', 'services',
        // 类型和模型
        'type', 'types', 'interface', 'interfaces', 'model', 'models', 
        'entity', 'entities', 'dto', 'dao', 'schema', 'schemas',
        // 状态管理
        'store', 'stores', 'state',
        // 样式
        'style', 'styles', 'css', 'scss', 'sass', 'less',
        // 配置
        'config', 'configs', 'configuration',
        // 测试
        'test', 'tests', 'mock', 'mocks',
        // 功能模块
        'feature', 'features', 'module', 'modules',
        // 共享和公共
        'shared', 'common', 'lib', 'libs', 'library',
        // 路由
        'route', 'routes', 'router',
        // 后端相关
        'middleware', 'controller', 'controllers', 'repository', 'repositories',
        'guard', 'guards', 'interceptor', 'interceptors', 'pipe', 'pipes',
        'filter', 'filters', 'decorator', 'decorators',
        // 布局
        'layout', 'layouts',
        // 常量
        'constant', 'constants', 'enum', 'enums',
        // 验证和格式化
        'validator', 'validators', 'formatter', 'formatters',
        // 适配器
        'adapter', 'adapters',
        // 提供者
        'provider', 'providers', 'factory', 'factories',
        // 策略
        'strategy', 'strategies',
        // 数据库相关
        'migration', 'migrations', 'seed', 'seeds',
        // 资源
        'asset', 'assets', 'static', 'public',
        // 国际化
        'locale', 'locales', 'i18n',
        // 主题
        'theme', 'themes',
        // 模板
        'template', 'templates', 'partial', 'partials',
        // 容器
        'container', 'containers',
        // 架构层
        'presentation', 'presentations', 'domain', 'domains',
        'infrastructure', 'infrastructures', 'application', 'applications',
        // 核心
        'core', 'kernel', 'base', 'bases',
        // 内部和外部
        'internal', 'internals', 'external', 'externals',
        // 第三方
        'vendor', 'vendors',
        // 插件和扩展
        'plugin', 'plugins', 'extension', 'extensions',
        // 工具和脚本
        'tool', 'tools', 'script', 'scripts',
        // 构建输出
        'bin', 'build', 'dist', 'out',
        // 文档
        'doc', 'docs', 'documentation',
        // 示例
        'example', 'examples', 'demo', 'demos', 'sample', 'samples',
      ];
      
      // 检查 purpose 是否为纯职能描述
      // 如果 purpose 只包含职能关键词（如 "page"、"component"），则是纯职能
      // 如果包含其他词汇（如 "payment page"），则是业务性
      const isPureFunctional = pureFunctionalKeywords.some(keyword => {
        // 精确匹配或作为独立单词出现
        const regex = new RegExp(`^${keyword}$|\\b${keyword}\\b`, 'i');
        return regex.test(purpose);
      });
      
      // 如果 purpose 不是纯职能关键词，且包含其他描述性词汇，则认为是业务文件夹
      if (!isPureFunctional) {
        // 检查是否包含业务性描述（非职能关键词的其他词汇）
        // 如果 purpose 长度超过单个职能关键词，可能包含业务描述
        const purposeWords = purpose.split(/\s+/).filter((w: string) => w.length > 0);
        const hasNonFunctionalWords = purposeWords.some((word: string) => {
          // 检查单词是否不在职能关键词列表中
          return !pureFunctionalKeywords.some(keyword => 
            word === keyword || word.includes(keyword) || keyword.includes(word)
          );
        });
        
        if (hasNonFunctionalWords) {
          return true; // 包含业务性词汇
        }
      }
    }
    
    // 标准2: 同级下有其他带有业务性词汇的同类文件夹
    if (dir.parentDirectory) {
      const siblings = deepAnalysis.filter(d => 
        d.parentDirectory === dir.parentDirectory && d.path !== dir.path
      );
      
      // 检查同级目录是否都是业务性命名（非职能关键词）
      const siblingNames = siblings.map(s => path.basename(s.path).toLowerCase());
      const hasBusinessSiblings = siblings.some(sibling => {
        const siblingName = path.basename(sibling.path).toLowerCase();
        // 如果同级目录名不包含职能关键词，可能是业务文件夹
        const isFunctionalSibling = functionalFolderKeywords.some(keyword => 
          siblingName === keyword || siblingName.includes(keyword)
        );
        return !isFunctionalSibling;
      });
      
      // 如果当前目录名也不包含职能关键词，且同级有业务性文件夹，则认为是业务文件夹
      const dirName = path.basename(dir.path).toLowerCase();
      const isFunctionalName = functionalFolderKeywords.some(keyword => 
        dirName === keyword || dirName.includes(keyword)
      );
      
      if (!isFunctionalName && hasBusinessSiblings && siblings.length > 0) {
        return true;
      }
    }
    
    // 标准3: 无法识别类别或无法匹配职能关键词列表
    if (dir.category === 'other' || !dir.category) {
      const dirName = path.basename(dir.path).toLowerCase();
      const dirPath = dir.path.toLowerCase();
      const isFunctional = functionalFolderKeywords.some(keyword => 
        dirName === keyword || dirName.includes(keyword) ||
        dirPath.includes(`/${keyword}/`) || dirPath.includes(`/${keyword}`)
      );
      
      // 判断 purpose 是否为 "other" 或空（只判断英文，不判断中文）
      const purposeLower = (dir.purpose || '').toLowerCase();
      const isOtherPurpose = !dir.purpose || 
                            purposeLower === 'other' || 
                            purposeLower === 'unknown' ||
                            purposeLower === '';
      
      if (!isFunctional && isOtherPurpose) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 生成目录职能说明（精简版，只显示职能文件夹层，不显示详细的业务类页面和组件）
   */
  private generateDirectoryPurposes(deepAnalysis: any[]): string {
    if (deepAnalysis.length === 0) {
      return "目录职能说明分析中...\n\n";
    }

    const functionalFolderKeywords = FUNCTIONAL_FOLDER_KEYWORDS;

    // 判断目录是否为职能文件夹（而非业务类页面/组件）
    const isFunctionalFolder = (dir: any): boolean => {
      const dirName = path.basename(dir.path).toLowerCase();
      const dirPath = dir.path.toLowerCase();
      
      // 检查目录名是否包含职能关键词
      const hasFunctionalKeyword = functionalFolderKeywords.some(keyword => 
        dirName === keyword || dirName.includes(keyword)
      );
      
      // 检查目录路径是否包含职能关键词
      const pathHasFunctionalKeyword = functionalFolderKeywords.some(keyword => 
        dirPath.includes(`/${keyword}/`) || dirPath.includes(`/${keyword}`)
      );
      
      // 如果目录有明确的职能说明（非业务相关），也认为是职能文件夹
      // 只判断英文，不判断中文
      const purposeLower = (dir.purpose || '').toLowerCase();
      const hasFunctionalPurpose = dir.purpose && 
        dir.purpose !== '' &&
        purposeLower !== 'other' &&
        purposeLower !== 'unknown' &&
        // 检查是否包含业务性描述（非纯职能关键词）
        !this.isBusinessFolder(dir, deepAnalysis);
      
      return hasFunctionalKeyword || pathHasFunctionalKeyword || hasFunctionalPurpose;
    };

    // 按重要性排序：文件数量多的、深度浅的优先
    const sorted = [...deepAnalysis]
      .filter((d) => {
        // 只保留职能文件夹（过滤掉业务类页面和组件）
        if (!isFunctionalFolder(d)) return false;
        
        // 新增：过滤掉业务性文件夹
        if (this.isBusinessFolder(d, deepAnalysis)) return false;
        
        // 过滤掉无意义的目录（空目录且无子目录）
        if (d.fileCount === 0 && (!d.childDirectories || d.childDirectories.length === 0)) return false;
        // 保留有文件或子目录的目录
        return true;
      })
      .sort((a, b) => {
        // 先按深度排序（浅的优先，最多显示到第3层）
        if (a.depth !== b.depth) return a.depth - b.depth;
        // 再按文件数量排序（多的优先）
        if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
        // 最后按路径排序
        return a.path.localeCompare(b.path);
      });

    // 只显示关键目录（深度 <= 3 的职能文件夹）
    const keyDirectories = sorted.filter((d) => d.depth <= 3);
    
    let content = "";
    
    content += `> 💡 命名规范和代码风格请参考 @code-style.mdc\n\n`;

    for (const dir of keyDirectories) {
      content += `### \`${dir.path}/\`\n\n`;
      content += `**职能**: ${dir.purpose || '未标识'}\n\n`;
      
      // 只保留真正有价值的信息
      
      // 1. 使用 index 文件（影响文件组织方式）
      if (dir.hasIndexFiles) {
        content += `- 使用 index 文件导出\n`;
      }
      
      // 2. 架构模式（影响代码组织）
      if (dir.architecturePattern) {
        content += `- 架构模式: ${dir.architecturePattern}\n`;
      }
      
      // 3. 子目录（只显示职能子目录，不显示业务子目录）
      if (dir.childDirectories && dir.childDirectories.length > 0) {
        const functionalChildren = dir.childDirectories.filter((c: string) => {
          const childDir = deepAnalysis.find((d) => d.path === c);
          return childDir && 
                 isFunctionalFolder(childDir) && 
                 !this.isBusinessFolder(childDir, deepAnalysis); // 新增：过滤业务文件夹
        });
        
        if (functionalChildren.length > 0) {
          const childCount = functionalChildren.length;
          const displayChildren = functionalChildren.slice(0, 5);
          content += `- 职能子目录 (${childCount} 个): ${displayChildren.map((c: string) => {
          const childName = c.split("/").pop() || c;
          return `\`${childName}\``;
        }).join(", ")}`;
        if (childCount > 5) {
          content += ` ...`;
        }
        content += `\n`;
        }
      }
      
      content += `\n`;
      }
      
    // 添加深层目录的简要说明
    const deepDirectories = sorted.filter((d) => d.depth > 3);
    if (deepDirectories.length > 0) {
      content += `\n---\n\n`;
      content += `**其他深层职能目录** (${deepDirectories.length} 个): 请参考上方目录树查看完整结构。\n\n`;
    }

    return content;
  }

  /**
   * 生成文件组织规则
   */
  private generateFileOrganizationRules(
    context: RuleGenerationContext
  ): string {
    if (!context.fileOrganization) {
      return "项目文件组织规范待补充。\n";
    }

    const org = context.fileOrganization;
    let content = "";

    // 组件位置
    if (org.componentLocation.length > 0) {
      content += `### 组件目录\n\n`;
      content += `**位置**: \`${org.componentLocation[0]}/\`\n\n`;
      if (org.namingConvention.components) {
        content += `**命名规范**: ${org.namingConvention.components}\n\n`;
      }
      content += `\n`;
    }

    // 工具函数位置
    if (org.utilsLocation.length > 0) {
      content += `### 工具函数目录\n\n`;
      content += `**位置**: \`${org.utilsLocation[0]}/\`\n\n`;
      content += `**组织方式**: 按功能分类创建文件（如 \`date.ts\`, \`validation.ts\`）\n\n`;
    }

    // 类型定义位置
    if (org.typesLocation && org.typesLocation.length > 0) {
      content += `### 类型定义目录\n\n`;
      content += `**位置**: \`${org.typesLocation[0]}/\`\n\n`;
    }

    // 样式目录：只在 basename 属于样式根目录语义词时展示
    // 深度本身不是判据，命名才是（styles/theme/tokens 是根；Funding/FormModule 是业务路径）
    const STYLE_ROOT_KEYWORDS = new Set([
      'styles', 'style', 'css', 'scss', 'less', 'sass',
      'theme', 'themes', 'tokens', 'stylesheets', 'assets',
    ]);
    if (org.stylesLocation && org.stylesLocation.length > 0) {
      const styleRootDir = org.stylesLocation.find((loc) => {
        const basename = loc.replace(/\/$/, '').split('/').pop() ?? '';
        return STYLE_ROOT_KEYWORDS.has(basename.toLowerCase());
      });
      if (styleRootDir) {
        content += `### 样式文件目录\n\n`;
        content += `**位置**: \`${styleRootDir}/\`\n\n`;
      }
    }

    // API 位置
    if (org.apiLocation && org.apiLocation.length > 0) {
      content += `### API 目录\n\n`;
      content += `**位置**: \`${org.apiLocation[0]}/\`\n\n`;
    }

    // Hooks 位置
    if (org.hooksLocation && org.hooksLocation.length > 0) {
      content += `### Hooks 目录\n\n`;
      content += `**位置**: \`${org.hooksLocation[0]}/\`\n\n`;
    }

    return content;
  }

  /**
   * 生成新建文件指南
   */
  private generateNewFileGuidelines(
    context: RuleGenerationContext
  ): string {
    const org = context.fileOrganization;
    const isTS = context.techStack.languages.includes("TypeScript");
    const ext = isTS ? "ts" : "js";
    const extx = isTS ? "tsx" : "jsx";
    const isFrontend = this.isFrontendProject(context);

    let content = `### 文件位置决策表\n\n`;
    content += `> 创建新文件时，先查此表找到正确目录，不确定则参考相似现有文件。\n\n`;
    content += `| 要创建的文件类型 | 放到哪里 | 示例文件名 |\n`;
    content += `|-----------------|---------|----------|\n`;

    if (org) {
      if (isFrontend) {
        // 页面/路由组件 与 可复用 UI 组件 语义不同，必须分别检测目录
        // 优先从 deepAnalysis 检测 views/pages/screens/routes 目录（取最浅路径）
        const PAGE_DIR_KEYWORDS = new Set(['views', 'pages', 'screens', 'routes']);
        const pageDir = (context.deepAnalysis ?? [])
          .filter(d => PAGE_DIR_KEYWORDS.has(d.path.split('/').pop()?.toLowerCase() ?? ''))
          .sort((a, b) => a.depth - b.depth)[0]?.path;

        if (pageDir && org.componentLocation.length > 0 && pageDir !== org.componentLocation[0]) {
          // 有独立页面目录 → 分别映射
          content += `| 页面组件 | \`${pageDir}/\` | \`UserList.${extx}\` |\n`;
          content += `| 可复用 UI 组件 | \`${org.componentLocation[0]}/\` | \`Button.${extx}\` |\n`;
        } else if (pageDir) {
          content += `| 页面 / 可复用组件 | \`${pageDir}/\` | \`UserList.${extx}\` |\n`;
        } else if (org.componentLocation.length > 0) {
          // 无独立页面目录，组件目录兼用于页面
          content += `| 组件（含页面）| \`${org.componentLocation[0]}/\` | \`UserList.${extx}\` |\n`;
        }
      }
      if (org.utilsLocation.length > 0) {
        const loc = org.utilsLocation[0];
        content += `| 工具函数 | \`${loc}/\` | \`format.${ext}\`, \`validate.${ext}\` |\n`;
      }
      if (org.hooksLocation && org.hooksLocation.length > 0) {
        const loc = org.hooksLocation[0];
        content += `| 自定义 Hook | \`${loc}/\` | \`useXxx.${ext}\` |\n`;
      }
      if (org.typesLocation && org.typesLocation.length > 0) {
        const loc = org.typesLocation[0];
        content += `| 类型定义 | \`${loc}/\` | \`user.types.${ext}\` |\n`;
      }
      if (org.apiLocation && org.apiLocation.length > 0) {
        const loc = org.apiLocation[0];
        content += `| API / Service | \`${loc}/\` | \`user.api.${ext}\` |\n`;
      }
    }
    content += `\n`;

    if (isFrontend && org?.namingConvention?.useIndexFiles) {
      content += `### 组件目录结构\n\n`;
      const compLoc = org.componentLocation[0] || 'src/components';
      content += `\`\`\`\n`;
      content += `${compLoc}/ComponentName/\n`;
      content += `  ├── index.${extx}       # 导出入口\n`;
      content += `  ├── ComponentName.${extx} # 实现文件\n`;
      content += `  └── ComponentName.test.${ext} # 测试文件\n`;
      content += `\`\`\`\n\n`;
    }

    if (
      context.projectConfig?.pathAliases &&
      Object.keys(context.projectConfig.pathAliases).length > 0
    ) {
      const aliases = Object.keys(context.projectConfig.pathAliases);
      content += `### 导入路径别名\n\n`;
      content += `使用别名代替相对路径：${aliases.map(a => `\`${a}\``).join(", ")}\n\n`;
    }

    return content;
  }

  /**
   * 获取架构模式名称（中文）
   */
  private getArchitecturePatternName(type: string): string {
    const names: Record<string, string> = {
      mvc: "MVC",
      "clean-architecture": "Clean Architecture",
      "feature-based": "Feature-based",
      "domain-driven": "Domain-driven Design",
      layered: "Layered",
      "modular-monolith": "Modular Monolith",
      microservices: "微服务",
      monorepo: "Monorepo",
      mixed: "混合架构",
      unknown: "未知",
    };
    return names[type] || type;
  }

  /**
   * v1.3: 生成项目架构规则（约 200 行，已移除结构相关内容）
   * v1.5: 补充缺失的最佳实践
   * v1.8: 移除文件组织相关内容，改为引用 project-structure.mdc
   */
  private generateArchitectureRule(
    context: RuleGenerationContext,
    missingPractices?: any[]
  ): CursorRule {
    const srcGlobs = this.getLanguageGlobs(context);
    const metadata = this.generateRuleMetadata(
      "项目架构",
      "Consult when designing features, adding modules, or making architectural decisions",
      90,
      context.techStack.primary,
      ["architecture", "modules"],
      "guideline",
      ["global-rules", "project-structure"],
      { globs: srcGlobs }
    );

    // 补充缺失的最佳实践
    const architecturePractices =
      missingPractices?.filter((p) => p.category === "architecture") || [];
    const additionalPractices = this.formatMissingPractices(
      architecturePractices
    );

    const codeFeaturesSection = this.generateCodeFeaturesSection(context);

    const content =
      metadata +
      `
# Project Architecture

See also: @global-rules.mdc, @project-structure.mdc

## Architecture Pattern

${
  context.architecturePattern
    ? this.generateArchitecturePatternSection(context.architecturePattern)
    : this.generateArchitecturePatternSection(context.architecturePattern || {
        type: "unknown",
        confidence: "low",
        indicators: []
      })
}

## Module Structure

${this.generateModuleStructureSection(context)}
${codeFeaturesSection}
## Design Principles

${this.generateArchitecturePrinciples(context)}

${additionalPractices ? `\n## Additional Best Practices\n\n${additionalPractices}\n` : ""}
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "architecture.mdc",
      priority: 90,
      type: "guideline",
      depends: ["global-rules", "project-structure"],
    };
  }

  private generateCodeFeaturesSection(context: RuleGenerationContext): string {
    const features = context.codeFeatures;
    if (!features || Object.keys(features).length === 0) return "";

    const coreFeatures: string[] = [];
    for (const [, feature] of Object.entries(features)) {
      // 只输出有具体约束意义的特性，跳过纯存在性描述（如「包含 API 路由定义」）
      if (feature.frequency > 0 && feature.description && !/包含|定义$/.test(feature.description)) {
        coreFeatures.push(`- ${feature.description}`);
      }
    }
    if (coreFeatures.length === 0) return "";

    return `\n## Core Code Patterns\n\n${coreFeatures.join("\n")}\n`;
  }

  /**
   * v1.3: 生成自定义工具规则（约 150 行）
   */
  private generateCustomToolsRule(context: RuleGenerationContext): CursorRule {
    const hookGlobs = this.getHookGlobs(context);
    const metadata = this.generateRuleMetadata(
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
   * v1.3: 生成错误处理规则（约 180 行）
   */
  private generateErrorHandlingRule(
    context: RuleGenerationContext,
    missingPractices?: any[]
  ): CursorRule {
    const langGlobsForErr = this.getLanguageGlobs(context);
    const metadata = this.generateRuleMetadata(
      "错误处理规范",
      "Error handling patterns, logging, and recovery strategies based on project conventions",
      80,
      context.techStack.primary,
      ["error-handling", "practice"],
      "practice",
      ["global-rules", "custom-tools"],
      { globs: langGlobsForErr }
    );

    // 补充缺失的最佳实践
    const errorHandlingPractices =
      missingPractices?.filter((p) => p.category === "error-handling") || [];
    const additionalPractices = this.formatMissingPractices(
      errorHandlingPractices
    );

    const content =
      metadata +
      `
# 错误处理规范

参考: @global-rules.mdc, @custom-tools.mdc

${this.generatePracticeBasedErrorHandling(context)}

${additionalPractices ? `\n## 补充的最佳实践\n\n${additionalPractices}\n` : ""}

---

*遵循项目现有的错误处理模式，保持一致性。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "error-handling.mdc",
      priority: 80,
      type: "practice",
      depends: ["global-rules", "custom-tools"],
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
    const metadata = this.generateRuleMetadata(
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
   * v1.3: 生成 UI/UX 规则（约 250 行）
   */
  private generateUIUXRule(context: RuleGenerationContext): CursorRule {
    // 收窄到 components/views 目录，避免所有 tsx 文件都触发
    const org = context.fileOrganization;
    const compDir = org?.componentLocation?.[0]?.replace(/\/$/, '') || 'src/components';
    const viewDir = 'src/views';
    const uiGlobs = `${compDir}/**/*.{tsx,jsx,vue,svelte}, ${viewDir}/**/*.{tsx,jsx,vue,svelte}`;
    const metadata = this.generateRuleMetadata(
      "UI/UX 设计规范",
      "UI component patterns and conventions for this project's UI library",
      75,
      context.techStack.primary,
      ["ui-ux", "frontend"],
      "guideline",
      ["global-rules", "code-style"],
      { globs: uiGlobs }
    );

    const content =
      metadata +
      `
# UI/UX 设计规范

参考: @global-rules.mdc, @code-style.mdc

${this.generateUIUXGuidelines(context)}

---

*UI/UX 规范确保良好的用户体验和无障碍访问。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "ui-ux.mdc",
      priority: 75,
      type: "guideline",
      depends: ["global-rules", "code-style"],
    };
  }

  /**
   * v1.3.x: 生成前端路由规则（约 300 行）
   */
  private generateFrontendRoutingRule(
    context: RuleGenerationContext
  ): CursorRule {
    const router = context.frontendRouter!;
    const routeGlobs = this.getRouteGlobs(router, "frontend");
    const metadata = this.generateRuleMetadata(
      "前端路由规范",
      `${router.info.framework} routing organization, navigation patterns, and URL conventions`,
      85,
      context.techStack.primary,
      ["routing", "frontend", "navigation"],
      "practice",
      ["global-rules", "architecture"],
      { globs: routeGlobs }
    );

    const content =
      metadata +
      `
# 前端路由规范

参考: @global-rules.mdc, @architecture.mdc

## 项目当前使用

**路由系统**: ${router.info.framework}${
        router.info.version ? ` (${router.info.version})` : ""
      }  
**路由类型**: ${this.getRouterTypeDescription(router.info.type)}  
**路由位置**: ${router.info.location.map((l) => `\`@${l}\``).join(", ")}

${this.generateFrontendRouterContent(router, context)}

---

*路由是应用的骨架，保持清晰的路由结构。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "frontend-routing.mdc",
      priority: 85,
      type: "practice",
      depends: ["global-rules", "architecture"],
    };
  }

  /**
   * v1.3.x: 生成后端路由规则（约 300 行）
   */
  private generateBackendRoutingRule(
    context: RuleGenerationContext
  ): CursorRule {
    const router = context.backendRouter!;
    const apiRouteGlobs = this.getRouteGlobs(router, "backend");
    const metadata = this.generateRuleMetadata(
      "API 路由规范",
      `${router.info.framework} API route handlers, middleware, and endpoint conventions`,
      85,
      context.techStack.primary,
      ["api", "routing", "backend"],
      "practice",
      ["global-rules", "architecture"],
      { globs: apiRouteGlobs }
    );

    const content =
      metadata +
      `
# API 路由规范

参考: @global-rules.mdc, @architecture.mdc

## 项目当前使用

**路由系统**: ${router.info.framework}  
**路由类型**: ${this.getRouterTypeDescription(router.info.type)}  
**路由位置**: ${router.info.location.map((l) => `\`@${l}\``).join(", ")}

${this.generateBackendRouterContent(router, context)}

---

*API 路由要保持 RESTful 设计，清晰的资源组织。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "api-routing.mdc",
      priority: 85,
      type: "practice",
      depends: ["global-rules", "architecture"],
    };
  }

  /**
   * 生成前端路由器内容
   */
  private generateFrontendRouterContent(
    router: { info: any; pattern: any; examples: any[] },
    context: RuleGenerationContext
  ): string {
    const { info, pattern, examples } = router;
    let content = "";

    // 路由生成方式（带确定性标注）
    const dynamicAnalysis = (router as any).dynamicAnalysis;
    if (dynamicAnalysis && dynamicAnalysis.isDynamic) {
      content += this.generateDynamicRoutingSection(dynamicAnalysis);
    }

    // 路由组织方式
    content += `## 路由组织方式\n\n`;
    content += `**组织模式**: ${this.getOrganizationDescription(
      pattern.organization
    )}\n`;
    content += `**URL 命名**: ${pattern.urlNaming}\n`;
    content += `**文件命名**: ${pattern.fileNaming}\n\n`;

    // 实际示例
    if (examples.length > 0) {
      content += `## 实际路由示例\n\n`;

      const staticRoutes = examples
        .filter((e) => e.type === "static")
        .slice(0, 3);
      if (staticRoutes.length > 0) {
        content += `### 静态路由\n\n`;
        for (const route of staticRoutes) {
          content += `- **@${route.filePath}** → \`${route.url}\`\n`;
        }
        content += `\n`;
      }

      const dynamicRoutes = examples
        .filter((e) => e.type === "dynamic")
        .slice(0, 3);
      if (dynamicRoutes.length > 0) {
        content += `### 动态路由\n\n`;
        for (const route of dynamicRoutes) {
          content += `- **@${route.filePath}** → \`${route.url}\`\n`;
        }
        content += `\n**参数获取**: 参见实际文件中的代码示例\n\n`;
      }
    }

    // 新建路由规范
    content += `## 新建路由时\n\n`;
    content += this.generateNewRouteGuidelines(info, pattern, examples);

    // 路由特性
    if (pattern.hasRouteGroups) {
      content += `## 路由分组\n\n`;
      content += `项目使用 ${pattern.groupPattern} 语法组织相关路由。\n\n`;
      content += `示例: 参见现有路由分组结构\n\n`;
    }

    if (pattern.hasGuards) {
      content += `## 路由守卫\n\n`;
      content += `项目使用路由守卫/中间件进行权限控制。\n\n`;
      if (pattern.guardFiles && pattern.guardFiles.length > 0) {
        content += `参考: @${pattern.guardFiles[0]}\n\n`;
      }
    }

    // 路由懒加载
    if (pattern.usesLazyLoading) {
      content += `## 路由懒加载\n\n`;
      content += `项目使用懒加载优化性能。\n\n`;
      content += `✅ 继续为大型页面使用懒加载\n\n`;
    }

    return content;
  }

  /**
   * 生成后端路由器内容
   */
  private generateBackendRouterContent(
    router: { info: any; pattern: any; examples: any[] },
    context: RuleGenerationContext
  ): string {
    const { info, pattern, examples } = router;
    let content = "";

    // API 路由组织
    content += `## API 路由组织\n\n`;
    content += `**组织模式**: ${this.getOrganizationDescription(
      pattern.organization
    )}\n`;
    content += `**URL 命名**: ${pattern.urlNaming}\n\n`;

    if (pattern.isDynamicGenerated) {
      content += `⚠️ **注意**: 项目路由通过脚本动态生成\n`;
      content += `生成脚本: \`${pattern.generationScript}\`\n\n`;
    }

    // 实际 API 示例
    if (examples.length > 0) {
      content += `## 实际 API 路由示例\n\n`;

      const grouped = this.groupExamplesByFile(examples);
      for (const [file, routes] of Object.entries(grouped).slice(0, 3)) {
        content += `### @${file}\n\n`;
        for (const route of routes.slice(0, 5)) {
          content += `- \`${route.method || "GET"} ${route.url}\`\n`;
        }
        content += `\n`;
      }
    }

    // RESTful 规范
    if (info.framework === "Express" || info.framework === "Fastify") {
      content += `## RESTful API 设计\n\n`;
      content += `项目 API 遵循 RESTful 设计原则：\n\n`;
      content += `- \`GET /resources\` - 获取列表\n`;
      content += `- \`GET /resources/:id\` - 获取单个\n`;
      content += `- \`POST /resources\` - 创建\n`;
      content += `- \`PUT /resources/:id\` - 更新\n`;
      content += `- \`DELETE /resources/:id\` - 删除\n\n`;
    }

    // 新建 API 规范
    content += `## 新建 API 路由时\n\n`;
    content += this.generateNewAPIRouteGuidelines(info, pattern, examples);

    // 中间件
    if (pattern.hasGuards) {
      content += `## 中间件使用\n\n`;
      content += `项目使用中间件进行认证、验证等处理。\n\n`;
      if (pattern.guardFiles) {
        content += `参考: @${pattern.guardFiles[0]}\n\n`;
      }
    }

    content += `## 短期规范\n\n`;
    content += `✅ 保持 RESTful API 设计原则\n`;
    content += `✅ 遵循现有的路由组织方式\n`;

    return content;
  }

  /**
   * 生成新建路由指南
   */
  /**
   * 根据路由框架类型生成「注册新路由」的代码片段。
   * 基于框架语义生成模板，不依赖读取特定项目文件，具备通用性。
   */
  private generateRouteRegistrationSnippet(info: any, pattern: any): string {
    const framework: string = info.framework ?? '';
    const routerType: string = info.type ?? 'config-based';
    const usesLazy: boolean = !!pattern.usesLazyLoading;

    if (framework.includes('Next.js')) {
      if (info.version === 'App Router') {
        return `\`\`\`
app/
└── feature-name/
    ├── page.tsx        # 页面组件（必须）
    └── layout.tsx      # 布局（可选，影响子路由）
\`\`\``;
      }
      return `\`\`\`
pages/
└── feature-name.tsx    # 文件即路由：/ → /feature-name
\`\`\``;
    }

    if (framework.includes('Vue Router') || framework.includes('Vue')) {
      const lazy = usesLazy
        ? `component: () => import('@/views/FeatureName.vue')`
        : `component: FeatureNameView`;
      return `\`\`\`typescript
// router/index.ts 或路由配置文件
{
  path: '/feature-name',
  name: 'FeatureName',
  ${lazy},
}
\`\`\``;
    }

    if (framework.includes('React Router') || routerType === 'config-based') {
      const lazy = usesLazy
        ? `element: React.lazy(() => import('@/views/FeatureName'))`
        : `element: <FeatureName />`;
      return `\`\`\`tsx
// src/router/index.tsx 或路由配置文件
{
  path: '/feature-name',
  ${lazy},
}
\`\`\``;
    }

    // 通用 fallback
    return `\`\`\`typescript
// 在路由配置文件中添加新路由条目
{ path: '/feature-name', component: FeaturePage }
\`\`\``;
  }

  private generateNewRouteGuidelines(
    info: any,
    pattern: any,
    examples: any[]
  ): string {
    let guidelines = "";

    if (info.framework.includes("Next.js")) {
      if (info.version === "App Router") {
        guidelines += `### 步骤\n\n`;
        guidelines += `1. 在 \`app/\` 目录确定路由路径\n`;
        guidelines += `2. 创建文件夹（URL 路径）\n`;
        guidelines += `3. 创建 \`page.tsx\`（页面组件）\n`;
        if (pattern.supportsLayouts) {
          guidelines += `4. 如需布局，创建 \`layout.tsx\`\n`;
        }
        guidelines += `\n`;
        guidelines += `### 路由注册格式\n\n`;
        guidelines += this.generateRouteRegistrationSnippet(info, pattern);
        guidelines += `\n\n`;

        if (examples.length > 0) {
          guidelines += `参考示例: @${examples[0].filePath}\n\n`;
        }
      }
    } else if (info.framework === "React Router") {
      guidelines += `### 步骤\n\n`;
      guidelines += `1. 在路由配置文件添加路由定义\n`;
      guidelines += `2. 创建对应的页面组件\n`;
      if (pattern.usesLazyLoading) {
        guidelines += `3. 大型页面使用懒加载\n`;
      }
      guidelines += `\n`;
      guidelines += `### 路由注册格式\n\n`;
      guidelines += this.generateRouteRegistrationSnippet(info, pattern);
      guidelines += `\n\n`;
    }

    return guidelines;
  }

  /**
   * 生成新建 API 路由指南
   */
  private generateNewAPIRouteGuidelines(
    info: any,
    pattern: any,
    examples: any[]
  ): string {
    let guidelines = "";

    if (info.framework === "Express") {
      guidelines += `### 步骤\n\n`;
      guidelines += `1. 在 \`routes/\` 目录创建或选择模块文件\n`;
      guidelines += `2. 定义路由处理器\n`;
      guidelines += `3. 使用 \`express.Router()\` 导出\n`;
      guidelines += `4. 在主文件注册路由\n\n`;

      if (examples.length > 0) {
        guidelines += `参考示例: @${examples[0].filePath}\n\n`;
      }
    } else if (info.framework === "Django") {
      guidelines += `### 步骤\n\n`;
      guidelines += `1. 在应用的 \`urls.py\` 添加路由\n`;
      guidelines += `2. 创建对应的视图函数\n`;
      guidelines += `3. 在主 \`urls.py\` 包含应用路由\n\n`;
    }

    return guidelines;
  }

  /**
   * 获取路由类型描述
   */
  private getRouterTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
      "file-based": "文件系统路由（约定式）",
      "config-based": "配置式路由（声明式）",
      programmatic: "编程式路由（代码定义）",
      mixed: "混合模式",
    };
    return descriptions[type] || type;
  }

  /**
   * 获取组织方式描述
   */
  private getOrganizationDescription(org: string): string {
    const descriptions: Record<string, string> = {
      centralized: "集中管理",
      distributed: "分散定义",
      "feature-based": "按功能模块组织",
      mixed: "混合方式",
    };
    return descriptions[org] || org;
  }

  /**
   * 生成动态路由章节（带确定性标注）
   */
  private generateDynamicRoutingSection(analysis: any): string {
    let section = `## 路由生成方式\n\n`;

    const certaintyLabels: Record<string, string> = {
      certain: "✅ [确定]",
      likely: "⚠️ [可能]",
      uncertain: "ℹ️ [不确定]",
    };

    const label =
      certaintyLabels[analysis.recommendation.certainty] || "ℹ️ [未知]";
    section += `### ${label} ${analysis.recommendation.explanation}\n\n`;

    if (analysis.documentation.found) {
      // 基于文档
      section += `**文档来源**: @${analysis.documentation.file}\n\n`;
      section += `项目文档说明：\n`;
      section += `> ${analysis.documentation.section.slice(0, 200)}...\n\n`;
      section += `**生成方法**: \`${analysis.recommendation.method}\`\n\n`;

      if (analysis.documentation.file) {
        section += `详见: @${analysis.documentation.file} 的路由章节\n\n`;
      }
    } else if (
      analysis.recommendation.certainty === "certain" ||
      analysis.recommendation.certainty === "likely"
    ) {
      // 基于高置信度检测
      section += `**检测到的方法**: \`${analysis.recommendation.method}\`\n\n`;

      if (analysis.scripts.files.length > 0) {
        section += `**脚本文件**: @${analysis.scripts.files[0]}\n`;
      }

      section += `\n**使用方法**:\n`;
      section += `\`\`\`bash\n${analysis.recommendation.method}\n\`\`\`\n\n`;
    } else {
      // 不确定
      section += `检测到项目可能使用脚本动态生成路由，但无法完全确定。\n\n`;

      section += `**可能的选项**:\n`;
      if (analysis.scripts.commands.length > 0) {
        section += `命令：\n`;
        for (const cmd of analysis.scripts.commands) {
          section += `- \`${cmd}\`\n`;
        }
      }
      if (analysis.scripts.files.length > 0) {
        section += `脚本：\n`;
        for (const file of analysis.scripts.files) {
          section += `- @${file}\n`;
        }
      }

      section += `\n**当前假设**: 使用 \`${analysis.recommendation.method}\`\n`;
      section += `（${analysis.recommendation.explanation}）\n\n`;

      section += `❓ **请确认**: 如果不正确，请告诉我正确的方式，我将更新此规则。\n\n`;
    }

    if (analysis.recommendation.certainty === "certain") {
      section += `✅ **新建路由时**: 使用上述方法生成路由，保持一致性。\n\n`;
    } else {
      section += `⚠️ **新建路由时**: 请先确认正确的生成方式，然后使用。\n\n`;
    }

    return section;
  }

  /**
   * 按文件分组示例
   */
  private groupExamplesByFile(examples: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    for (const example of examples) {
      if (!grouped[example.filePath]) {
        grouped[example.filePath] = [];
      }
      grouped[example.filePath].push(example);
    }
    return grouped;
  }

  /**
   * v1.3: 生成测试规则（约 220 行或简短）
   */
  private generateTestingRule(context: RuleGenerationContext): CursorRule {
    const hasTests = this.featureExists(context, "testing");

    const testGlobs = "**/*.{test,spec}.{ts,tsx,js,jsx}";
    const metadata = this.generateRuleMetadata(
      "测试规范",
      hasTests ? "Testing patterns, organization, and best practices" : "Testing recommendations for the project",
      70,
      context.techStack.primary,
      ["testing"],
      hasTests ? "practice" : "suggestion",
      ["global-rules"],
      { globs: testGlobs }
    );

    const testFramework = this.detectTestFramework(context);
    const testCmd = context.projectConfig?.commands?.test;
    const frameworkSection = testFramework
      ? `**Framework**: ${testFramework.name}${testFramework.version ? ` ${testFramework.version}` : ""}\n`
      : "";
    const cmdSection = testCmd ? `**Run tests**: \`${testCmd}\`\n` : "";

    const content =
      metadata +
      `
# Testing

${frameworkSection}${cmdSection}

${this.generateConditionalTestingRules(context)}
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "testing.mdc",
      priority: 70,
      type: hasTests ? "practice" : "suggestion",
      depends: ["global-rules"],
    };
  }

  /**
   * API Patterns — 基于项目实际 API 客户端生成调用规范
   */
  private generateApiPatternsRule(context: RuleGenerationContext): CursorRule {
    const org = context.fileOrganization;
    const apiClient = context.customPatterns?.apiClient;
    const apiDir = org?.apiLocation?.[0] || 'src/api';
    const apiAlias = apiDir.replace(/^src\//, '@/');
    const isTS = context.techStack.languages.includes("TypeScript");
    const ext = isTS ? "ts" : "js";
    const clientName = apiClient?.name || "apiClient";
    const clientPath = apiClient?.filePath
      ? apiClient.filePath.replace(/^.*?src\//, 'src/')
      : `${apiDir}/index.${ext}`;
    const clientImportAlias = clientPath.replace(/^src\//, '@/').replace(/\.(ts|js)$/, '');
    const hasAuth = apiClient?.hasAuth ?? false;
    const hasErrorHandling = apiClient?.hasErrorHandling ?? false;

    const globs = `${apiDir}/**`;
    const metadata = this.generateRuleMetadata(
      "API 调用规范",
      "How to call backend APIs: file location, client usage, error handling",
      80,
      context.techStack.primary,
      ["api", "http"],
      "practice",
      ["global-rules"],
      { globs }
    );

    const content = metadata + `
# API 调用规范

## 核心约定

- 所有 API 函数集中放在 \`${apiDir}/\` 目录下，按业务模块分文件
- **禁止**在组件/Store 中直接 \`fetch\`/\`axios.get\`，必须通过封装函数
- 每个函数只做一件事：请求 + 返回数据（副作用在调用方处理）

## HTTP 客户端

项目已封装 \`${clientName}\`，位于 \`${clientPath}\`：

\`\`\`${ext}
import { ${clientName} } from "${clientImportAlias}";
\`\`\`

${hasAuth ? `> ✅ 已内置鉴权逻辑（Token 自动注入），调用方无需手动设置 Authorization header。\n` : ""}
${hasErrorHandling ? `> ✅ 已内置统一错误处理（非 2xx 响应会统一弹出提示或跳转登录）。\n` : ""}

## 标准函数结构

\`\`\`${ext}
// ${apiDir}/feature.${ext}
import { ${clientName} } from "${clientImportAlias}";
${isTS ? `import type { FeatureItem, FeatureListParams } from "@/interface/feature";\n` : ""}
export async function fetchFeatureList(${isTS ? "params: FeatureListParams" : "params"}): Promise<${isTS ? "FeatureItem[]" : "any"}> {
  const { data } = await ${clientName}.get("/api/features", { params });
  return data;
}

export async function createFeature(${isTS ? "payload: Partial<FeatureItem>" : "payload"}): Promise<${isTS ? "FeatureItem" : "any"}> {
  const { data } = await ${clientName}.post("/api/features", payload);
  return data;
}
\`\`\`

## Do / Don't

\`\`\`${ext}
// ❌ 组件内直接 fetch
useEffect(() => {
  axios.get("/api/features").then(setList);
}, []);

// ✅ 调用封装函数
useEffect(() => {
  fetchFeatureList({ page: 1, pageSize: 20 }).then(setList);
}, []);
\`\`\`

${!hasErrorHandling ? `## 错误处理

每个 API 函数必须处理异常，或在调用方 try-catch：

\`\`\`${ext}
try {
  const list = await fetchFeatureList(params);
  setList(list);
} catch (error) {
  message.error("加载失败");
}
\`\`\`

参考: @error-handling.mdc` : ""}
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "api-patterns.mdc",
      priority: 80,
      type: "practice",
      depends: ["global-rules"],
    };
  }

  /**
   * Feature Recipe — 端到端功能创建指南
   * 回答"我要新增一个完整功能需要创建哪些文件、遵循什么步骤"这个核心问题
   */
  private async generateFeatureRecipeRule(context: RuleGenerationContext): Promise<CursorRule> {
    const metadata = this.generateRuleMetadata(
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
// ${compDir}/FeatureList/FeatureList.${extx}
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
- [ ] \`${compDir}/FeatureList/\` — 页面组件
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

  private detectTestFramework(context: RuleGenerationContext): { name: string; version?: string } | null {
    const deps = context.techStack.dependencies || [];
    const testLibs = [
      { pkg: "vitest", name: "Vitest" },
      { pkg: "jest", name: "Jest" },
      { pkg: "mocha", name: "Mocha" },
      { pkg: "@testing-library/react", name: "React Testing Library" },
      { pkg: "cypress", name: "Cypress" },
      { pkg: "playwright", name: "Playwright" },
    ];
    for (const lib of testLibs) {
      const dep = deps.find(d => d.name === lib.pkg);
      if (dep) return { name: lib.name, version: dep.version };
    }
    return null;
  }

  private generateMockExample(context: RuleGenerationContext): string {
    const fw = this.detectTestFramework(context);
    const mockFn = fw?.name === "Vitest" ? "vi.fn" : "jest.fn";
    return `\`\`\`typescript
// ✅ Good mock usage
const mockApiClient = {
  fetchUser: ${mockFn}().mockResolvedValue({ id: 1, name: 'John' })
};

// ❌ Over-mocking
const mockEverything = ${mockFn}(() => ${mockFn}(() => ${mockFn}()));
\`\`\``;
  }

  /**
   * 生成项目结构描述
   */
  private generateProjectStructureDescription(
    context: RuleGenerationContext
  ): string {
    if (context.modules.length <= 1) {
      return "这是一个单体应用项目。";
    }

    const modulesByType = new Map<string, Module[]>();
    for (const module of context.modules) {
      if (!modulesByType.has(module.type)) {
        modulesByType.set(module.type, []);
      }
      modulesByType.get(module.type)!.push(module);
    }

    let desc = `这是一个${
      context.modules.length > 5 ? "大型" : ""
    }多模块项目，包含以下模块：\n\n`;

    for (const [type, modules] of modulesByType) {
      desc += `**${this.getModuleTypeName(type)}模块：**\n`;
      desc += modules.map((m) => `- ${m.name}`).join("\n") + "\n\n";
    }

    return desc;
  }

  /**
   * 生成功能特征描述
   */
  private generateFeaturesDescription(
    features: Record<string, CodeFeature>
  ): string {
    const entries = Object.values(features);
    if (entries.length === 0) {
      return "项目功能特征分析中...";
    }

    return entries
      .map(
        (f) => `### ${f.description}

- **类型：** ${f.type}
- **使用频率：** ${f.frequency} 处
${
  f.examples.length > 0
    ? `- **示例：** ${f.examples.slice(0, 3).join(", ")}`
    : ""
}
`
      )
      .join("\n");
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
      ? this.generatePracticeBasedErrorHandling(context)
      : this.generateErrorHandlingGuidelines(context);

    // 添加测试相关指南（按需生成）
    guidelines += this.generateConditionalTestingRules(context);

    // 添加 UI/UX 规范（前端项目）
    if (this.isFrontendProject(context)) {
      guidelines += this.generateUIUXGuidelines(context);
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
   * 判断是否为前端项目
   */
  private isFrontendProject(context: RuleGenerationContext): boolean {
    const frontendFrameworks = [
      "React",
      "Vue",
      "Angular",
      "Svelte",
      "Next.js",
      "Nuxt",
    ];
    return context.techStack.frameworks.some((f) =>
      frontendFrameworks.includes(f)
    );
  }

  /**
   * 生成 UI/UX 规范
   */
  private generateUIUXGuidelines(context: RuleGenerationContext): string {
    const deps = context.techStack.dependencies || [];
    const hasAntd = deps.some((d) => d.name === "antd" || d.name === "@ant-design/pro-components");
    const hasMui = deps.some((d) => d.name === "@mui/material" || d.name === "@material-ui/core");
    const hasShadcn = deps.some((d) => d.name === "@radix-ui/react-dialog" || d.name === "shadcn-ui");
    const hasStyledComponents = deps.some((d) => d.name === "styled-components");
    const hasTailwind = deps.some((d) => d.name === "tailwindcss");
    const hasLess = deps.some((d) => d.name === "less");
    const isTS = context.techStack.languages.includes("TypeScript");

    // 确定样式方案描述
    let styleApproach = "";
    if (hasAntd && hasStyledComponents) {
      styleApproach = "antd 组件 + styled-components 自定义样式";
    } else if (hasAntd && hasLess) {
      styleApproach = "antd 组件 + Less 变量覆盖";
    } else if (hasAntd) {
      styleApproach = "antd 组件库";
    } else if (hasMui) {
      styleApproach = "Material UI";
    } else if (hasShadcn) {
      styleApproach = "shadcn/ui + Radix UI";
    } else if (hasTailwind) {
      styleApproach = "Tailwind CSS";
    } else {
      styleApproach = "自定义 CSS/CSS Modules";
    }

    let content = `## 项目 UI 方案\n\n`;
    content += `**当前使用**: ${styleApproach}\n\n`;

    if (hasAntd) {
      content += `### Antd 使用约定\n\n`;
      content += `**Do ✅**\n`;
      content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
      content += `// 优先使用 antd 原生 API，不要重复封装已有能力\n`;
      content += `import { Table, Form, Modal, Button, Space } from "antd";\n\n`;
      content += `// Form 使用 Form.useForm()，不要直接 ref\n`;
      content += `const [form] = Form.useForm();\n\n`;
      content += `// Table 分页统一走 onChange 回调\n`;
      content += `<Table\n`;
      content += `  dataSource={data}\n`;
      content += `  columns={columns}\n`;
      content += `  pagination={{ current, pageSize, total, onChange: handlePageChange }}\n`;
      content += `/>;\n`;
      content += `\`\`\`\n\n`;

      content += `**Don't ❌**\n`;
      content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
      content += `// 不要用原生 <button> 替代 antd Button\n`;
      content += `<button onClick={…}>提交</button>\n\n`;
      content += `// 不要重新实现 antd 已有的 Modal.confirm / message.error\n`;
      content += `const MyAlert = () => <div className="alert">{msg}</div>;\n`;
      content += `\`\`\`\n\n`;

      content += `### 常用场景\n\n`;
      content += `| 场景 | 使用组件 |\n`;
      content += `|------|---------|\n`;
      content += `| 数据列表 | \`Table\` + \`useTable\` hook |\n`;
      content += `| 表单提交 | \`Form\` + \`Form.useForm()\` |\n`;
      content += `| 确认弹窗 | \`Modal.confirm()\` |\n`;
      content += `| 操作反馈 | \`message.success/error()\` |\n`;
      content += `| 加载状态 | \`Spin\` 或 Table \`loading\` prop |\n\n`;
    }

    if (hasStyledComponents) {
      content += `### Styled-components 约定\n\n`;
      content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
      content += `// 命名：S + PascalCase（避免与组件名冲突）\n`;
      content += `const SWrapper = styled.div\`\n`;
      content += `  padding: 16px;\n`;
      content += `  background: \${({ theme }) => theme.colors.background};\n`;
      content += `\`;\n\n`;
      content += `// 不要内联大块 CSS，抽出命名 styled 组件\n`;
      content += `\`\`\`\n\n`;
    } else if (hasTailwind) {
      content += `### Tailwind 约定\n\n`;
      content += `- 复杂样式组合提取为 \`@apply\` 或 styled 组件，不要行内堆砌超过 8 个 class\n`;
      content += `- 响应式前缀顺序：\`sm:\` → \`md:\` → \`lg:\`\n\n`;
    }

    content += `### 无障碍（A11y）最低要求\n\n`;
    content += `- 交互元素必须有 \`aria-label\` 或可见文本\n`;
    content += `- 图标按钮加 \`title\` 属性\n`;
    content += `- 表单字段关联 \`label\`（htmlFor）\n\n`;

    return content;
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
   * 生成错误处理指南
   */
  private generateErrorHandlingGuidelines(
    context: RuleGenerationContext
  ): string {
    const isJavaScript =
      context.techStack.languages.includes("JavaScript") ||
      context.techStack.languages.includes("TypeScript");
    const isPython = context.techStack.languages.includes("Python");

    // v1.9: 精简版，避免与 error-handling.mdc 重复
    return `## 错误处理规范

> 💡 **详细规范**: 完整的错误处理指南请参考 **@error-handling.mdc**

### 基本原则
- 预测可能的错误并主动处理
- 提供有意义的错误信息
- 区分可恢复和不可恢复的错误
- 记录错误以便调试

### 快速参考
- **Try-Catch**: 用于同步代码和 async/await
- **自定义错误**: 创建特定的错误类型以便精确处理
- **错误日志**: 使用适当的日志级别，包含上下文信息
- **用户消息**: 提供友好的错误提示，不暴露技术细节

`;
  }

  /**
   * 生成测试指南（精简版）
   * v1.9: 移除详细测试示例，避免与 testing.mdc 重复
   */
  private generateTestingGuidelines(context: RuleGenerationContext): string {
    return `## 测试规范

> 💡 **详细规范**: 完整的测试指南请参考 **@testing.mdc**

### 测试原则
- **独立性**：每个测试应该独立运行，不依赖其他测试
- **可重复性**：测试结果应该是确定的，不受运行顺序影响
- **快速执行**：单元测试应该快速完成
- **清晰性**：测试应该清楚地表达意图

### 快速参考
- **测试文件**: \`ComponentName.test.ts\` 或 \`ComponentName.spec.ts\`
- **AAA 模式**: Arrange（准备）→ Act（执行）→ Assert（验证）
- **覆盖率目标**: 核心业务逻辑达到 80%+ 覆盖率
- **优先级**:
  1. 关键业务逻辑
  2. 边界情况和错误处理
  3. 复杂的算法和数据转换
- **不需要测试**：
  - 简单的 getter/setter
  - 第三方库的功能
  - 纯 UI 布局（可以用 E2E 测试）

### Mock and Stub
- Use mocks to isolate external dependencies
- Do not over-mock; keep tests meaningful
- Create mocks for API calls, database operations, and other I/O

${this.generateMockExample(context)}

### 测试类型
- **单元测试**：测试单个函数或类的行为
- **集成测试**：测试多个模块的协作
- **E2E 测试**：测试完整的用户流程

### 最佳实践
- 一个测试只验证一个行为
- 使用有意义的断言消息
- 测试失败时应该清楚地指出问题所在
- 定期运行测试，不要让测试过时
- 失败的测试应该立即修复

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
   * 生成模块开发指南
   */
  private generateModuleGuidelines(
    context: RuleGenerationContext,
    module: Module,
    structureAnalysis?: any,
    businessAnalysis?: any
  ): string {
    const guidelines: string[] = [];

    // 基于模块类型的基础指南
    if (module.type === "frontend") {
      guidelines.push("- 保持组件可复用性和可测试性");
      guidelines.push("- 使用统一的状态管理方案");
      guidelines.push("- 优化性能，避免不必要的重渲染");
      guidelines.push("- 确保响应式设计适配不同设备");
    } else if (module.type === "backend") {
      guidelines.push("- 实施适当的错误处理机制");
      guidelines.push("- 提供完整的 API 文档");
      guidelines.push("- 确保数据验证和安全性");
      guidelines.push("- 实现日志记录便于调试");
    } else if (module.type === "shared") {
      guidelines.push("- 保持代码通用性，避免特定业务逻辑");
      guidelines.push("- 提供完整的类型定义和文档");
      guidelines.push("- 确保向后兼容性");
      guidelines.push("- 编写充分的单元测试");
    } else {
      guidelines.push("- 遵循单一职责原则");
      guidelines.push("- 提供清晰的接口定义");
      guidelines.push("- 编写必要的文档和示例");
      guidelines.push("- 确保代码质量和测试覆盖");
    }

    // 基于结构分析的指南
    if (structureAnalysis) {
      const pattern = structureAnalysis.fileOrganizationPattern;
      
      if (pattern.usesCoLocation) {
        guidelines.push("- 相关文件（组件、样式、测试、类型）应放在同一目录（co-location）");
      }
      
      if (pattern.usesIndexFiles) {
        guidelines.push("- 使用 index 文件作为目录入口，统一导出");
      }
      
      if (pattern.primaryNamingPattern !== "mixed") {
        guidelines.push(`- 遵循 ${pattern.primaryNamingPattern} 命名规范`);
    }
    }

    // 基于业务分析的指南
    if (businessAnalysis?.businessPattern) {
      if (businessAnalysis.businessPattern.includes("DDD")) {
        guidelines.push("- 遵循领域驱动设计原则，保持领域模型清晰");
        guidelines.push("- 区分实体、值对象、领域服务等概念");
      } else if (businessAnalysis.businessPattern.includes("Feature-based")) {
        guidelines.push("- 按功能特性组织代码，保持功能内聚");
        guidelines.push("- 每个功能模块应包含完整的业务逻辑");
      } else if (businessAnalysis.businessPattern.includes("Clean Architecture")) {
        guidelines.push("- 遵循分层架构，保持依赖方向正确");
        guidelines.push("- 业务逻辑不应依赖框架和外部库");
      }
    }

    // 基于依赖关系的指南
    if (businessAnalysis?.dependentModules && businessAnalysis.dependentModules.length > 0) {
      guidelines.push(`- 此模块被其他模块依赖（${businessAnalysis.dependentModules.join("、")}），修改时需考虑兼容性`);
    }

    if (businessAnalysis?.internalDependencies && businessAnalysis.internalDependencies.length > 0) {
      guidelines.push(`- 依赖内部模块（${businessAnalysis.internalDependencies.join("、")}），注意版本兼容性`);
    }

    return guidelines.join("\n");
  }

  /**
   * 生成模块注意事项
   */
  private generateModuleCautions(module: Module): string {
    const cautions: string[] = [];

    if (module.type === "shared") {
      cautions.push("- 修改共享模块时需考虑对其他模块的影响");
      cautions.push("- 避免添加特定业务逻辑");
    }

    if (module.type === "backend") {
      cautions.push("- 注意 API 的向后兼容性");
      cautions.push("- 确保敏感数据安全");
    }

    if (module.type === "frontend") {
      cautions.push("- 注意浏览器兼容性");
      cautions.push("- 优化打包体积");
    }

    cautions.push("- 遵循模块的设计原则和约定");

    return cautions.map((c) => c).join("\n");
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
      guide += `5. **模块边界**: 此模块为 ${this.getModuleTypeName(module.type)} 类型，代码需符合该类型职责范围\n\n`;
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

  /**
   * 生成规则元数据（v1.3 增强）
   */
  private generateRuleMetadata(
    _title: string,
    description: string,
    _priority: number,
    _techStack: string[],
    _tags: string[],
    _type?: string,
    _depends?: string[],
    activation?: {
      alwaysApply?: boolean;
      globs?: string | string[];
    }
  ): string {
    let metadata = `---\ndescription: ${description}\n`;

    if (activation?.alwaysApply) {
      metadata += `alwaysApply: true\n`;
    } else if (activation?.globs) {
      metadata += `alwaysApply: false\n`;
      const globsValue = Array.isArray(activation.globs)
        ? activation.globs.join(", ")
        : activation.globs;
      metadata += `globs: ${globsValue}\n`;
    } else {
      metadata += `alwaysApply: false\n`;
    }

    metadata += `---\n\n`;
    return metadata;
  }

  private generateVersionedTechStack(context: RuleGenerationContext): string {
    const lines: string[] = [];
    const deps = context.techStack.dependencies || [];

    const primaryWithVersions = context.techStack.primary.map((tech) => {
      const dep = deps.find(
        (d) => d.name.toLowerCase() === tech.toLowerCase() ||
          d.name.toLowerCase().includes(tech.toLowerCase())
      );
      return dep ? `${tech} ${dep.version}` : tech;
    });

    lines.push(`**Primary**: ${primaryWithVersions.join(", ")}`);
    lines.push(`**Languages**: ${context.techStack.languages.join(", ")}`);
    lines.push(`**Package Manager**: ${context.techStack.packageManagers.join(", ")}`);
    if (context.techStack.frameworks.length > 0) {
      const fwWithVersions = context.techStack.frameworks.map((fw) => {
        const dep = deps.find(
          (d) => d.name.toLowerCase() === fw.toLowerCase() ||
            d.name.toLowerCase().includes(fw.toLowerCase())
        );
        return dep ? `${fw} ${dep.version}` : fw;
      });
      lines.push(`**Frameworks**: ${fwWithVersions.join(", ")}`);
    }

    return lines.join("  \n");
  }

  private generateCommandsSection(context: RuleGenerationContext): string {
    const cmds = context.projectConfig?.commands;
    if (!cmds) return "";

    const entries: string[] = [];
    if (cmds.build) entries.push(`| Build | \`${cmds.build}\` |`);
    if (cmds.dev) entries.push(`| Dev | \`${cmds.dev}\` |`);
    if (cmds.start) entries.push(`| Start | \`${cmds.start}\` |`);
    if (cmds.test) entries.push(`| Test | \`${cmds.test}\` |`);
    if (cmds.lint) entries.push(`| Lint | \`${cmds.lint}\` |`);
    if (cmds.lintFix) entries.push(`| Lint Fix | \`${cmds.lintFix}\` |`);
    if (cmds.format) entries.push(`| Format | \`${cmds.format}\` |`);
    // typeCheck 已在 config-parser 层通过命令值判断排除复合命令，展示侧直接使用
    if (cmds.typeCheck) entries.push(`| Type Check | \`${cmds.typeCheck}\` |`);

    if (entries.length === 0) return "";

    return `\n## Commands\n\n| Task | Command |\n|------|---------|
${entries.join("\n")}\n`;
  }

  private getLanguageGlobs(context: RuleGenerationContext): string {
    const langs = context.techStack.languages.map((l) => l.toLowerCase());
    const exts: string[] = [];
    if (langs.includes("typescript") || langs.includes("javascript")) {
      exts.push("ts", "tsx", "js", "jsx");
    }
    if (langs.includes("python")) exts.push("py");
    if (langs.includes("go")) exts.push("go");
    if (langs.includes("rust")) exts.push("rs");
    if (langs.includes("java")) exts.push("java");
    if (langs.includes("ruby")) exts.push("rb");
    if (langs.includes("php")) exts.push("php");
    if (exts.length === 0) exts.push("ts", "tsx", "js", "jsx");
    return `**/*.{${exts.join(",")}}`;
  }

  private getRouteGlobs(router: any, type: "frontend" | "backend"): string {
    const locations: string[] = (router?.info?.location || [])
      .filter((loc: string) => !path.isAbsolute(loc));
    if (locations.length > 0) {
      return locations.map((loc: string) => `${loc}**`).join(", ");
    }
    return type === "frontend"
      ? "**/routes/**, **/pages/**, **/app/**"
      : "**/routes/**, **/api/**, **/controllers/**";
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
   * 生成角色定义（Persona）
   */
  private generatePersona(context: RuleGenerationContext): string {
    const allTech = [
      ...context.techStack.primary,
      ...context.techStack.frameworks.filter(
        (f) => !context.techStack.primary.includes(f)
      ),
    ];

    const isFrontend = this.isFrontendProject(context);
    const backendIndicators = ["express", "fastify", "koa", "nestjs", "django", "flask", "spring"];
    const isBackend = [
      ...context.techStack.primary,
      ...context.techStack.frameworks
    ].some((tech) => backendIndicators.some(b => tech.toLowerCase().includes(b)));

    let role: string;
    if (isFrontend && isBackend) {
      role = "full-stack development";
    } else if (isFrontend) {
      role = "frontend development";
    } else if (isBackend) {
      role = "backend development";
    } else {
      role = "software engineering";
    }

    return `You are an expert in ${allTech.join(", ")} with deep knowledge of ${role} best practices.`;
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
    const metadata = this.generateRuleMetadata(
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
    content += `- **模块类型**: ${this.getModuleTypeName(module.type)}\n`;
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
      fileName: `${this.sanitizeFileName(module.name)}-overview.mdc`,
      priority: 50,
      type: "overview",
      depends: ["global-rules"],
    };
  }

  /**
   * 获取项目名称
   */
  private getProjectName(projectPath: string): string {
    return path.basename(projectPath);
  }

  /**
   * 格式化缺失的最佳实践（v1.5）
   * 将项目已使用但未声明的实践格式化为规则内容
   */
  private formatMissingPractices(practices: any[]): string {
    if (!practices || practices.length === 0) {
      return "";
    }

    let content = "";
    for (const practice of practices) {
      content += `### ${practice.title}\n\n`;
      content += `${practice.content}\n\n`;

      if (practice.techStack && practice.techStack.length > 0) {
        content += `**相关技术栈**: ${practice.techStack.join(", ")}\n\n`;
      }

      content += "---\n\n";
    }

    return content.trim();
  }

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
   * 获取模块类型名称
   */
  private getModuleTypeName(type: string): string {
    const names: Record<string, string> = {
      frontend: "前端",
      backend: "后端",
      shared: "共享",
      service: "服务",
      package: "包",
      other: "其他",
    };
    return names[type] || type;
  }

  /**
   * 评估深度分析数据的质量
   */
  private assessDeepAnalysisQuality(
    deepAnalysis: any[] | undefined
  ): {
    isIncomplete: boolean;
    reason: string;
    quality: "good" | "fair" | "poor" | "missing";
  } {
    if (!deepAnalysis || deepAnalysis.length === 0) {
      return {
        isIncomplete: true,
        reason: "未获取到任何目录分析数据",
        quality: "missing",
      };
    }

    // 检查是否有根目录（depth === 1）
    const rootDirs = deepAnalysis.filter((d) => d.depth === 1);
    if (rootDirs.length === 0) {
      return {
        isIncomplete: true,
        reason: "缺少根目录分析数据",
        quality: "poor",
      };
    }

    // 检查是否有层级关系（parentDirectory）
    const hasHierarchy = deepAnalysis.some((d) => d.parentDirectory);
    if (!hasHierarchy && deepAnalysis.length > rootDirs.length) {
      return {
        isIncomplete: true,
        reason: "目录层级关系不完整",
        quality: "fair",
      };
    }

    // 检查职能识别的完整性（是否有大量"其他"分类）
    const otherCount = deepAnalysis.filter(
      (d) => {
        // 只判断英文，不判断中文
        const purposeLower = (d.purpose || '').toLowerCase();
        return purposeLower === 'other' || purposeLower === 'unknown' || d.category === "other";
      }
    ).length;
    const otherRatio = otherCount / deepAnalysis.length;

    if (otherRatio > 0.5) {
      return {
        isIncomplete: true,
        reason: `超过 ${Math.round(otherRatio * 100)}% 的目录职能未能识别`,
        quality: "fair",
      };
    }

    // 数据质量良好
    return {
      isIncomplete: false,
      reason: "",
      quality: "good",
    };
  }

  /**
   * 清理文件名
   */
  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

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

      rules += `### ⚠️ 代码格式化要求\n\n`;
      rules += `**生成代码时**，Cursor 必须：\n`;
      rules += `1. 尽量遵循上述 Prettier 配置\n`;
      rules += `2. 使用${p.singleQuote ? "单引号" : "双引号"}包裹字符串\n`;
      rules += `3. 使用 ${
        p.useTabs ? "Tab" : `${p.tabWidth || 2} 个空格`
      }缩进\n`;
      rules += `4. ${p.semi ? "添加" : "不添加"}分号\n\n`;

      rules += `**生成代码后**，必须运行格式化命令：\n\n`;

      if (context.projectConfig.commands?.format) {
        rules += `\`\`\`bash\n`;
        rules += `${context.projectConfig.commands.format}\n`;
        rules += `\`\`\`\n\n`;
        rules += `**提示**: 生成代码后，请主动询问：\n`;
        rules += `\`\`\`\n`;
        rules += `需要我运行格式化命令吗？\n`;
        rules += `${context.projectConfig.commands.format}\n`;
        rules += `\`\`\`\n\n`;
      } else {
        rules += `\`\`\`bash\n`;
        rules += `npx prettier --write [文件路径]\n`;
        rules += `\`\`\`\n\n`;
      }
    } else if (context.projectPractice?.codeStyle) {
      // 使用分析出的代码风格
      const style = context.projectPractice.codeStyle;
      rules += `### 项目当前实践（分析得出）\n\n`;
      rules += `通过分析项目代码，发现以下风格模式：\n\n`;
      // TypeScript/modern JS 项目不可能以 var 为主，若检测为 var 优先使用 const/let 作为保底
      const isTS = context.techStack.languages.includes("TypeScript");
      const varDisplay = (isTS && style.variableDeclaration === "var")
        ? "const/let（TypeScript 项目标准）"
        : style.variableDeclaration === "const-let" ? "const/let" : style.variableDeclaration === "var" ? "var" : "const/let（混合）";
      rules += `- **变量声明**: 主要使用 ${varDisplay}\n`;
      rules += `- **函数风格**: ${
        style.functionStyle === "arrow" ? "箭头函数" : "function 声明"
      }\n`;
      rules += `- **字符串引号**: ${
        style.stringQuote === "single"
          ? "单引号"
          : style.stringQuote === "double"
          ? "双引号"
          : "混合"
      }\n`;
      rules += `- **分号**: ${
        style.semicolon === "always"
          ? "使用"
          : style.semicolon === "never"
          ? "不使用"
          : "混合"
      }\n\n`;
      // 移除建议，改为收集到 SuggestionCollector
      rules += `### 当前实践\n\n`;
      rules += `✅ 保持与现有代码一致的风格\n\n`;
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

    // 代码生成后的完整流程（唯一输出命令的位置）
    if (context.projectConfig.commands) {
      rules += `### 代码生成后的标准流程\n\n`;
      rules += `**每次生成代码后，Cursor 必须提示运行**：\n\n`;
      rules += `\`\`\`bash\n`;

      const steps: string[] = [];
      if (context.projectConfig.commands.format) {
        steps.push(`# 1. 格式化代码\n${context.projectConfig.commands.format}`);
      }
      if (context.projectConfig.commands.lintFix) {
        steps.push(
          `# 2. 修复 lint 问题\n${context.projectConfig.commands.lintFix}`
        );
      } else if (context.projectConfig.commands.lint) {
        steps.push(`# 2. 检查 lint\n${context.projectConfig.commands.lint}`);
      }
      if (context.projectConfig.commands.typeCheck) {
        steps.push(
          `# 3. 类型检查\n${context.projectConfig.commands.typeCheck}`
        );
      }

      rules += steps.join("\n\n");
      rules += `\n\`\`\`\n\n`;

      rules += `**Cursor 的标准提示**：\n`;
      rules += `\`\`\`\n`;
      rules += `代码已生成。需要我运行以下命令确保代码符合项目规范吗？\n\n`;
      if (context.projectConfig.commands.format) {
        rules += `${context.projectConfig.commands.format}  # 格式化\n`;
      }
      if (context.projectConfig.commands.lintFix) {
        rules += `${context.projectConfig.commands.lintFix}  # 修复问题\n`;
      }
      rules += `\`\`\`\n\n`;
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
   * 生成基于项目实践的错误处理规则（v1.2 - 三段式）
   */
  generatePracticeBasedErrorHandling(context: RuleGenerationContext): string {
    if (!context.projectPractice?.errorHandling) {
      return this.generateErrorHandlingGuidelines(context);
    }

    const eh = context.projectPractice.errorHandling;
    const isTS = context.techStack.languages.includes("TypeScript");
    const logMethod = eh.loggingMethod === "logger-library" && eh.loggerLibrary
      ? eh.loggerLibrary
      : "console";
    const logCall = logMethod === "console" ? "console.error" : `${logMethod}.error`;

    let rules = `## 项目错误处理规范\n\n`;

    if (eh.type === "none" || eh.frequency === 0) {
      rules += `⚠️ 项目尚未建立系统的错误处理模式，请遵循以下约定。\n\n`;
    } else {
      rules += `项目主要使用 **${
        eh.type === "try-catch" ? "try-catch" : "Promise.catch()"
      }** 处理错误`;
      if (eh.customErrorTypes.length > 0) {
        rules += `，自定义错误类型：${eh.customErrorTypes.map((t: string) => `\`${t}\``).join("、")}`;
      }
      rules += `。\n\n`;
    }

    rules += `### Do ✅\n\n`;
    rules += `\`\`\`${isTS ? "typescript" : "javascript"}\n`;
    rules += `// 异步操作：捕获并记录，向上层暴露有意义的错误\n`;
    rules += `async function fetchData(id: string) {\n`;
    rules += `  try {\n`;
    rules += `    return await api.get(id);\n`;
    rules += `  } catch (err) {\n`;
    rules += `    ${logCall}('[fetchData] failed', { id, err });\n`;
    rules += `    throw err; // 让调用方决定如何展示\n`;
    rules += `  }\n`;
    rules += `}\n`;
    rules += `\`\`\`\n\n`;

    rules += `### Don't ❌\n\n`;
    rules += `\`\`\`${isTS ? "typescript" : "javascript"}\n`;
    rules += `// 吞掉错误 — 导致静默失败，难以排查\n`;
    rules += `try { await doSomething(); } catch (_) {}\n\n`;
    rules += `// 记录但不抛出 — 上层不知道操作失败\n`;
    rules += `try { await doSomething(); } catch (err) { ${logCall}(err); }\n`;
    rules += `\`\`\`\n\n`;

    rules += `### 规则\n\n`;
    rules += `- **catch 块不能为空**：必须 log + re-throw 或显式处理。\n`;
    rules += `- **日志包含上下文**：\`${logCall}('[scope]', { ...params, err })\`\n`;
    rules += `- **区分错误类型**：业务错误（可恢复）vs 系统错误（不可恢复），后者直接 throw。\n`;
    rules += `- **用户提示友好**：展示给用户的消息不含技术细节，记录原始错误到日志。\n`;

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

    // 自定义 Hooks
    if (context.customPatterns.customHooks && context.customPatterns.customHooks.length > 0) {
      rules += `### 自定义 Hooks\n\n`;
      rules += `项目定义了以下自定义 hooks，**生成代码时必须优先使用**：\n\n`;

      // 过滤掉使用频率为 0 的 hooks（可能是未使用或已废弃），频率 0 仍保留但标记
      const topHooks = context.customPatterns.customHooks
        .filter((h) => h.frequency > 0)
        .slice(0, 10);
      if (topHooks.length === 0) {
        rules += `> 项目中的自定义 hooks 尚未检测到使用记录，请参考 @project-structure.mdc 确认 hooks 目录位置。\n\n`;
      }
      for (const hook of topHooks) {
        rules += `**${hook.name}** ${
          hook.description ? `- ${hook.description}` : ""
        }\n`;
        rules += `- 位置: \`${hook.relativePath}\`\n`;
        rules += `- 使用频率: ${
          hook.frequency > 10 ? "高" : hook.frequency > 3 ? "中" : "低"
        } (${hook.frequency} 处)\n`;
        if (hook.usage) {
          rules += `- 使用方式:\n`;
          rules += `  \`\`\`typescript\n`;
          rules += `  ${hook.usage}\n`;
          rules += `  \`\`\`\n`;
        }
        rules += `\n`;
      }
    }

    // 自定义工具函数
    if (context.customPatterns.customUtils && context.customPatterns.customUtils.length > 0) {
      rules += `### 自定义工具函数\n\n`;
      rules += `项目定义了以下工具函数，**生成代码时必须优先使用**：\n\n`;

      // 按类别分组
      const utilsByCategory = this.groupUtilsByCategory(
        context.customPatterns.customUtils
      );

      for (const [category, utils] of Object.entries(utilsByCategory)) {
        rules += `**${category}**:\n`;
        for (const util of utils.slice(0, 5)) {
          rules += `- \`${util.name}\` (${util.relativePath})\n`;
          if (util.signature) {
            rules += `  \`\`\`typescript\n  ${util.signature}\n  \`\`\`\n`;
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
   * 生成基于项目结构的文件组织规则（v1.2）
   */
  generateStructureBasedFileOrgRules(context: RuleGenerationContext): string {
    if (!context.fileOrganization) {
      return this.generateFileOrganizationGuidelines(context);
    }

    const org = context.fileOrganization;
    let rules = `## 文件组织规范（基于项目实际结构）\n\n`;

    // 项目目录结构
    rules += `### 项目目录结构\n\n`;
    rules += `项目采用以下目录组织方式，**生成代码时必须遵循**：\n\n`;
    rules += `\`\`\`\n`;

    // 显示主要目录
    const topDirs = org.structure
      .filter((d) => !d.path.includes("/"))
      .slice(0, 10);
    for (const dir of topDirs) {
      rules += `${dir.path}/  # ${dir.purpose} (${dir.fileCount} 个文件)\n`;

      // 显示子目录
      const children = org.structure
        .filter(
          (d) =>
            d.path.startsWith(dir.path + "/") && d.path.split("/").length === 2
        )
        .slice(0, 5);

      for (const child of children) {
        const childName = child.path.split("/").pop();
        rules += `  ├── ${childName}/  # ${child.purpose}\n`;
      }
    }

    rules += `\`\`\`\n\n`;

    // 文件创建规则
    rules += `### 新建文件规则\n\n`;

    if (org.componentLocation.length > 0) {
      rules += `**新建组件**:\n`;
      rules += `- 位置: \`${org.componentLocation[0]}/\`\n`;
      rules += `- 命名: ${org.namingConvention.components}\n`;
      if (org.namingConvention.useIndexFiles) {
        rules += `- 结构: 每个组件一个目录，使用 index 文件导出\n`;
        rules += `  \`\`\`\n`;
        rules += `  components/Button/\n`;
        rules += `    ├── index.tsx\n`;
        rules += `    ├── Button.tsx\n`;
        rules += `    └── styles.ts\n`;
        rules += `  \`\`\`\n`;
      }
      rules += `\n`;
    }

    if (org.utilsLocation.length > 0) {
      rules += `**新建工具函数**:\n`;
      rules += `- 位置: \`${org.utilsLocation[0]}/\`\n`;
      rules += `- 按功能分类创建文件（如 date.ts, validation.ts）\n\n`;
    }

    // 导入规范
    if (
      context.projectConfig?.pathAliases &&
      Object.keys(context.projectConfig.pathAliases).length > 0
    ) {
      rules += `### 导入规范\n\n`;
      rules += `**必须使用路径别名**，不要使用相对路径：\n`;
      rules += `\`\`\`typescript\n`;
      rules += `// ✅ 正确\n`;
      const aliases = Object.keys(context.projectConfig.pathAliases);
      if (aliases.length > 0) {
        rules += `import { Button } from '${aliases[0]}/components/Button';\n`;
      }
      rules += `\n// ❌ 错误\n`;
      rules += `import { Button } from '../../../components/Button';\n`;
      rules += `\`\`\`\n\n`;
    }

    return rules;
  }

  /**
   * 生成架构模式章节
   */
  private generateArchitecturePatternSection(pattern: any): string {
    if (!pattern || pattern.type === "unknown") {
      return "项目架构模式：标准架构（基于目录结构推断）\n\n";
    }

    let content = `项目采用 **${this.getArchitecturePatternName(pattern.type)}** 架构模式。\n\n`;

    // 注意：置信度（confidence）和识别依据（indicators）是生成器内部分析元数据，
    // 不应出现在规则内容中 — 规则只输出对 AI Agent 有指导意义的约束。

    if (pattern.layerStructure) {
      content += `### 层级结构\n\n`;
      if (pattern.layerStructure.presentation) {
        content += `- **表示层**: ${pattern.layerStructure.presentation.map((p: string) => `\`${p}\``).join(", ")}\n`;
      }
      if (pattern.layerStructure.application) {
        content += `- **应用层**: ${pattern.layerStructure.application.map((a: string) => `\`${a}\``).join(", ")}\n`;
      }
      if (pattern.layerStructure.domain) {
        content += `- **领域层**: ${pattern.layerStructure.domain.map((d: string) => `\`${d}\``).join(", ")}\n`;
      }
      if (pattern.layerStructure.infrastructure) {
        content += `- **基础设施层**: ${pattern.layerStructure.infrastructure.map((i: string) => `\`${i}\``).join(", ")}\n`;
      }
      content += `\n`;
    }
    
    if (pattern.featureStructure) {
      content += `### 功能结构\n\n`;
      content += `- **功能模块**: ${pattern.featureStructure.features.map((f: string) => `\`${f}\``).join(", ")}\n`;
      if (pattern.featureStructure.shared) {
        content += `- **共享模块**: ${pattern.featureStructure.shared.map((s: string) => `\`${s}\``).join(", ")}\n`;
      }
      content += `\n`;
    }
    
    return content;
  }

  /**
   * 基于项目结构推断架构模式
   */
  /**
   * 生成模块结构章节（基于 deepAnalysis 和 project-structure.mdc 的树形结构）
   */
  private generateModuleStructureSection(context: RuleGenerationContext): string {
    // 优先使用 deepAnalysis 来生成模块结构摘要
    if (context.deepAnalysis && context.deepAnalysis.length > 0) {
      return this.generateModuleStructureFromDeepAnalysis(context);
    }

    // 降级：使用 modules 信息
    if (context.modules.length <= 1) {
      return "这是一个单体应用项目，没有明确的模块划分。\n";
    }

    const modulesByType = new Map<string, any[]>();
    for (const module of context.modules) {
      if (!modulesByType.has(module.type)) {
        modulesByType.set(module.type, []);
      }
      modulesByType.get(module.type)!.push(module);
    }

    let content = `项目包含 **${context.modules.length}** 个模块：\n\n`;

    for (const [type, modules] of modulesByType) {
      content += `### ${this.getModuleTypeName(type)}模块\n\n`;
      for (const module of modules) {
        content += `- **${module.name}** (\`${module.path}\`)\n`;
        if (module.description) {
          content += `  - ${module.description}\n`;
        }
      }
      content += `\n`;
    }

    return content;
  }

  /**
   * 基于 deepAnalysis 生成模块结构摘要
   */
  private generateModuleStructureFromDeepAnalysis(
    context: RuleGenerationContext
  ): string {
    const deepAnalysis = context.deepAnalysis || [];

    // 找到顶级目录（depth === 1 或没有父目录的）
    const pathMap = new Set(deepAnalysis.map((d) => d.path));
    const topLevelDirs = deepAnalysis.filter((d) => {
      return (
        d.depth === 1 ||
        !d.parentDirectory ||
        !pathMap.has(d.parentDirectory)
      );
    });

    // 按目录类型分类
    const dirsByCategory = new Map<string, any[]>();
    for (const dir of topLevelDirs) {
      const category = dir.category || "other";
      if (!dirsByCategory.has(category)) {
        dirsByCategory.set(category, []);
      }
      dirsByCategory.get(category)!.push(dir);
    }

    let content = `基于项目目录结构分析，项目主要包含以下模块和目录：\n\n`;

    // 按类别组织显示
    const categoryOrder = [
      "package",
      "project",
      "module",
      "component",
      "service",
      "api",
      "shared",
      "common",
      "other",
    ];

    for (const category of categoryOrder) {
      if (!dirsByCategory.has(category)) continue;

      const dirs = dirsByCategory.get(category)!;
      const categoryName = this.getCategoryDisplayName(category);

      content += `### ${categoryName}\n\n`;

      for (const dir of dirs.sort((a, b) =>
        path.basename(a.path).localeCompare(path.basename(b.path))
      )) {
        const dirName = path.basename(dir.path);
        content += `- **\`${dirName}/\`** - ${dir.purpose}\n`;
        if (dir.fileCount > 0) {
          content += `  - 包含 ${dir.fileCount} 个文件\n`;
        }
        if (dir.childDirectories && dir.childDirectories.length > 0) {
          const childCount = dir.childDirectories.length;
          content += `  - 包含 ${childCount} 个子目录\n`;
        }
      }
      content += `\n`;
    }

    // 如果有 modules 信息，也补充显示
    if (context.modules.length > 1) {
      content += `### 模块列表\n\n`;
      content += `项目包含 **${context.modules.length}** 个已识别的模块：\n\n`;
      for (const module of context.modules) {
        content += `- **${module.name}** (\`${module.path}\`)\n`;
        if (module.description) {
          content += `  - ${module.description}\n`;
        }
      }
      content += `\n`;
    }

    content += `> 💡 **提示**: 详细的目录结构和职能说明请参考 @project-structure.mdc。\n\n`;

    return content;
  }

  /**
   * 获取类别显示名称
   */
  private getCategoryDisplayName(category: string): string {
    const names: Record<string, string> = {
      package: "包/库模块",
      project: "项目模块",
      module: "功能模块",
      component: "组件模块",
      service: "服务模块",
      api: "API 模块",
      shared: "共享模块",
      common: "公共模块",
      other: "其他目录",
    };
    return names[category] || category;
  }

  /**
   * 生成架构设计原则
   */
  private generateArchitecturePrinciples(context: RuleGenerationContext): string {
    let content = `### 核心原则\n\n`;
    content += `- **模块化**: 按功能模块组织代码，保持模块间的低耦合\n`;
    content += `- **可维护性**: 代码结构清晰，易于理解和修改\n`;
    content += `- **可扩展性**: 支持功能扩展而不影响现有代码\n`;
    content += `- **单一职责**: 每个模块、组件、函数只负责一个功能\n`;
    content += `\n`;

    if (context.architecturePattern) {
      const pattern = context.architecturePattern;
      if (pattern.type === "clean-architecture") {
        content += `### Clean Architecture 原则\n\n`;
        content += `- 依赖方向：外层依赖内层，内层不依赖外层\n`;
        content += `- 业务逻辑在领域层，不依赖框架和外部服务\n`;
        content += `- 接口定义在应用层，实现在基础设施层\n`;
        content += `\n`;
      } else if (pattern.type === "feature-based") {
        content += `### Feature-based 原则\n\n`;
        content += `- 按功能特性组织代码，而非按技术类型\n`;
        content += `- 每个功能模块包含完整的业务逻辑\n`;
        content += `- 共享代码放在 shared 或 common 目录\n`;
        content += `\n`;
      }
    }

    return content;
  }

  /**
   * 检查功能是否在项目中存在
   */
  private featureExists(
    context: RuleGenerationContext,
    featureName: string
  ): boolean {
    // 检查代码特征
    if (context.codeFeatures[featureName]) {
      return context.codeFeatures[featureName].frequency > 0;
    }

    // 检查依赖
    const featureDeps: Record<string, string[]> = {
      testing: ["jest", "vitest", "mocha", "@testing-library"],
      "state-management": ["redux", "zustand", "mobx", "pinia", "vuex"],
      styling: ["styled-components", "@emotion", "tailwindcss", "@mui"],
    };

    if (featureDeps[featureName]) {
      return context.techStack.dependencies.some((d) =>
        featureDeps[featureName].some((lib) => d.name.includes(lib))
      );
    }

    return false;
  }

  /**
   * 生成按需的测试规则（v1.2）
   */
  generateConditionalTestingRules(context: RuleGenerationContext): string {
    const hasTests = this.featureExists(context, "testing");

    if (!hasTests) {
      // 项目没有测试 - 简短提示
      return `## 测试\n\n### 当前状态\n⚠️ 项目当前未配置测试框架\n\n如需添加测试，请参考相关技术栈的测试最佳实践。\n\n`;
    }

    // v1.9: 添加引用说明，避免重复基础规范
    let rules = `> 💡 **基础规范**: 测试文件命名和组织规范请参考 **@code-style.mdc**\n\n`;

    // 项目有测试 - 生成详细规则
    rules += this.generateTestingGuidelines(context);
    
    return rules;
  }

}
