import { Dependency, RuleGenerationContext } from '../../types.js';
import { logger } from '../../utils/logger.js';

/**
 * 规则需求分析结果
 */
export interface RuleRequirement {
  ruleType: string;
  ruleFileName: string;
  priority: number;
  reason: string;
  detectedFrom: "dependency" | "file-structure" | "config" | "code-analysis";
  confidence: "high" | "medium" | "low";
  dependencies?: string[]; // 触发此规则的依赖包
  configFiles?: string[]; // 触发此规则的配置文件
}

/**
 * 规则需求分析器
 * 根据技术栈依赖、文件结构和配置，分析需要生成哪些规则文件
 */
export class RuleRequirementsAnalyzer {
  /**
   * 分析项目需要哪些规则文件
   */
  analyzeRequirements(context: RuleGenerationContext): RuleRequirement[] {
    const requirements: RuleRequirement[] = [];

    // 1. 基础规则（总是需要）
    requirements.push({
      ruleType: "global-overview",
      ruleFileName: "global-rules.mdc",
      priority: 100,
      reason: "项目全局规则，必需",
      detectedFrom: "code-analysis",
      confidence: "high",
    });

    requirements.push({
      ruleType: "code-style",
      ruleFileName: "code-style.mdc",
      priority: 90,
      reason: "代码风格规范，必需",
      detectedFrom: "code-analysis",
      confidence: "high",
    });

    requirements.push({
      ruleType: "architecture",
      ruleFileName: "architecture.mdc",
      priority: 90,
      reason: "项目架构规范，必需",
      detectedFrom: "code-analysis",
      confidence: "high",
    });

    // 2. 路由相关规则（基于依赖和文件结构）
    this.analyzeRoutingRequirements(requirements, context);

    // 3. 状态管理规则（基于依赖）
    this.analyzeStateManagementRequirements(requirements, context);

    // 4. UI 框架规则（基于依赖）
    this.analyzeUIFrameworkRequirements(requirements, context);

    // 5. 样式处理规则（基于依赖）
    this.analyzeStylingRequirements(requirements, context);

    // 6. 测试规则（基于依赖）
    this.analyzeTestingRequirements(requirements, context);

    // 7. 数据库/ORM 规则（基于依赖）
    this.analyzeDatabaseRequirements(requirements, context);

    // 8. API 客户端规则（基于依赖和代码分析）
    this.analyzeAPIClientRequirements(requirements, context);

    // 9. 构建工具规则（基于依赖和配置）
    this.analyzeBuildToolRequirements(requirements, context);

    // 10. 自定义工具规则（基于代码分析）
    this.analyzeCustomToolsRequirements(requirements, context);

    // 11. 错误处理规则（基于代码分析）
    this.analyzeErrorHandlingRequirements(requirements, context);

    return requirements.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 分析路由相关规则需求
   */
  private analyzeRoutingRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const routingDeps = this.findRoutingDependencies(
      context.techStack.dependencies
    );
    const hasRouterFiles = context.frontendRouter || context.backendRouter;

    // 前端路由
    const frontendRouterDeps = routingDeps.filter((d) =>
      ["react-router", "next", "nuxt", "vue-router", "remix", "sveltekit"].some(
        (name) => d.name.toLowerCase().includes(name)
      )
    );

    if (frontendRouterDeps.length > 0 || context.frontendRouter) {
      requirements.push({
        ruleType: "frontend-routing",
        ruleFileName: "frontend-routing.mdc",
        priority: 85,
        reason: hasRouterFiles
          ? `检测到前端路由文件结构（${
              context.frontendRouter?.info.framework || "未知"
            }）`
          : `检测到前端路由依赖：${frontendRouterDeps
              .map((d) => d.name)
              .join(", ")}`,
        detectedFrom: hasRouterFiles ? "file-structure" : "dependency",
        confidence: hasRouterFiles ? "high" : "medium",
        dependencies: frontendRouterDeps.map((d) => d.name),
      });
    }

    // 后端路由（精确匹配，避免子字符串误匹配如 originjs → gin）
    const isBackendFramework = (name: string): boolean => {
      const n = name.toLowerCase();
      return (
        n === "express" || n.startsWith("express/") || n.startsWith("express-") ||
        n === "fastify" || n.startsWith("fastify/") || n.startsWith("fastify-") ||
        n === "koa" || n.startsWith("koa/") || n.startsWith("koa-") ||
        n === "hapi" || n === "@hapi/hapi" || n.startsWith("@hapi/") ||
        n === "nestjs" || n === "@nestjs/core" || n.startsWith("@nestjs/") ||
        n === "django" || n === "flask" || n === "gin" ||
        n === "spring-boot" || n.startsWith("spring-")
      );
    };
    const backendRouterDeps = routingDeps.filter((d) => isBackendFramework(d.name));

    if (backendRouterDeps.length > 0 || context.backendRouter) {
      requirements.push({
        ruleType: "backend-routing",
        ruleFileName: "api-routing.mdc",
        priority: 85,
        reason: hasRouterFiles
          ? `检测到后端路由文件结构（${
              context.backendRouter?.info.framework || "未知"
            }）`
          : `检测到后端路由依赖：${backendRouterDeps
              .map((d) => d.name)
              .join(", ")}`,
        detectedFrom: hasRouterFiles ? "file-structure" : "dependency",
        confidence: hasRouterFiles ? "high" : "medium",
        dependencies: backendRouterDeps.map((d) => d.name),
      });
    }
  }

  /**
   * 分析状态管理规则需求
   */
  private analyzeStateManagementRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const stateDeps = this.findStateManagementDependencies(
      context.techStack.dependencies
    );

    if (stateDeps.length > 0) {
      requirements.push({
        ruleType: "state-management",
        ruleFileName: "state-management.mdc",
        priority: 85,
        reason: `检测到状态管理库：${stateDeps.map((d) => d.name).join(", ")}`,
        detectedFrom: "dependency",
        confidence: "high",
        dependencies: stateDeps.map((d) => d.name),
      });
    }
  }

  /**
   * 分析 UI 框架规则需求
   */
  private analyzeUIFrameworkRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    // 唯一判据：项目内真实使用的 UI 类依赖（基于代码扫描裁定）。
    // 不以前端框架或组件目录作为判据 —— 框架存在不代表使用了 UI 库，
    // 组件可能是业务组件而非 UI 组件。
    const activeUI = context.uiLibraries?.active ?? [];

    if (activeUI.length > 0) {
      requirements.push({
        ruleType: "ui-ux",
        ruleFileName: "ui-ux.mdc",
        priority: 75,
        reason: `检测到真实使用的 UI 库：${activeUI.map((l) => l.name).join(", ")}`,
        detectedFrom: "dependency",
        confidence: "high",
        dependencies: activeUI.map((l) => l.pkg),
      });
    }
  }

  /**
   * 分析样式处理规则需求
   */
  private analyzeStylingRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const stylingDeps = this.findStylingDependencies(
      context.techStack.dependencies
    );

    if (stylingDeps.length > 0) {
      // 样式规则可以合并到 UI/UX 规则中，但如果使用特定的样式库，可以单独生成
      const hasTailwind = stylingDeps.some((d) =>
        d.name.toLowerCase().includes("tailwind")
      );
      const hasStyledComponents = stylingDeps.some((d) =>
        d.name.toLowerCase().includes("styled-components")
      );

      if (hasTailwind || hasStyledComponents) {
        // 样式规则通常合并到 UI/UX 规则中，这里只记录，不单独生成
        logger.debug("检测到样式库", {
          tailwind: hasTailwind,
          styledComponents: hasStyledComponents,
        });
      }
    }
  }

  /**
   * 分析测试规则需求
   */
  private analyzeTestingRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const testingDeps = this.findTestingDependencies(
      context.techStack.dependencies
    );
    const hasTestFiles = context.codeFeatures["testing"];

    if (testingDeps.length > 0 || hasTestFiles) {
      requirements.push({
        ruleType: "testing",
        ruleFileName: "testing.mdc",
        priority: 70,
        reason: hasTestFiles
          ? "检测到测试文件"
          : `检测到测试框架依赖：${testingDeps.map((d) => d.name).join(", ")}`,
        detectedFrom: hasTestFiles ? "file-structure" : "dependency",
        confidence: hasTestFiles ? "high" : "medium",
        dependencies: testingDeps.map((d) => d.name),
      });
    }
  }

  /**
   * 分析数据库/ORM 规则需求
   */
  private analyzeDatabaseRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const dbDeps = this.findDatabaseDependencies(
      context.techStack.dependencies
    );

    if (dbDeps.length > 0) {
      // 数据库规则可以合并到架构规则中，但如果使用特定的 ORM，可以单独生成
      logger.debug("检测到数据库/ORM 依赖", {
        dependencies: dbDeps.map((d) => d.name),
      });
    }
  }

  /**
   * 分析 API 客户端规则需求
   */
  private analyzeAPIClientRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const apiDeps = this.findAPIClientDependencies(
      context.techStack.dependencies
    );
    const hasAPIClient = context.customPatterns?.apiClient?.exists;

    if (apiDeps.length > 0 || hasAPIClient) {
      // API 客户端规则通常合并到自定义工具规则中
      logger.debug("检测到 API 客户端", {
        dependencies: apiDeps.map((d) => d.name),
        customClient: hasAPIClient,
      });
    }
  }

  /**
   * 分析构建工具规则需求
   */
  private analyzeBuildToolRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const buildDeps = this.findBuildToolDependencies(
      context.techStack.dependencies
    );

    if (buildDeps.length > 0) {
      // 构建工具规则可以合并到架构规则中
      logger.debug("检测到构建工具", {
        dependencies: buildDeps.map((d) => d.name),
      });
    }
  }

  /**
   * 分析自定义工具规则需求
   */
  private analyzeCustomToolsRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const hasCustomTools =
      (context.customPatterns?.customHooks.length ?? 0) > 0 ||
      (context.customPatterns?.customUtils.length ?? 0) > 0 ||
      context.customPatterns?.apiClient?.exists;

    if (hasCustomTools) {
      requirements.push({
        ruleType: "custom-tools",
        ruleFileName: "custom-tools.mdc",
        priority: 95,
        reason: "检测到自定义 Hooks、工具函数或 API 客户端",
        detectedFrom: "code-analysis",
        confidence: "high",
      });
    }
  }

  /**
   * 分析错误处理规则需求
   */
  private analyzeErrorHandlingRequirements(
    requirements: RuleRequirement[],
    context: RuleGenerationContext
  ): void {
    const hasErrorHandling =
      context.projectPractice?.errorHandling &&
      context.projectPractice.errorHandling.frequency > 0;

    if (hasErrorHandling) {
      requirements.push({
        ruleType: "error-handling",
        ruleFileName: "error-handling.mdc",
        priority: 80,
        reason: "检测到错误处理模式",
        detectedFrom: "code-analysis",
        confidence: "high",
      });
    }
  }

  /**
   * 查找路由相关依赖
   */
  private findRoutingDependencies(dependencies: Dependency[]): Dependency[] {
    const routingKeywords = [
      "router",
      "route",
      "next",
      "nuxt",
      "remix",
      "sveltekit",
      "express",
      "fastify",
      "koa",
      "hapi",
      "nestjs",
      "django",
      "flask",
      "gin",
      "echo",
      "fiber",
    ];

    return dependencies.filter((dep) =>
      routingKeywords.some((keyword) =>
        dep.name.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * 查找状态管理依赖
   */
  private findStateManagementDependencies(
    dependencies: Dependency[]
  ): Dependency[] {
    const stateKeywords = [
      "redux",
      "zustand",
      "mobx",
      "pinia",
      "vuex",
      "recoil",
      "jotai",
      "valtio",
    ];

    return dependencies.filter((dep) =>
      stateKeywords.some((keyword) =>
        dep.name.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * 查找样式处理依赖
   */
  private findStylingDependencies(dependencies: Dependency[]): Dependency[] {
    const stylingKeywords = [
      "tailwind",
      "styled-components",
      "emotion",
      "sass",
      "less",
      "stylus",
      "css-modules",
    ];

    return dependencies.filter((dep) =>
      stylingKeywords.some((keyword) =>
        dep.name.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * 查找测试框架依赖
   */
  private findTestingDependencies(dependencies: Dependency[]): Dependency[] {
    const testingKeywords = [
      "jest",
      "vitest",
      "mocha",
      "chai",
      "cypress",
      "playwright",
      "testing-library",
      "pytest",
      "unittest",
    ];

    return dependencies.filter((dep) =>
      testingKeywords.some((keyword) =>
        dep.name.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * 查找数据库/ORM 依赖
   */
  private findDatabaseDependencies(dependencies: Dependency[]): Dependency[] {
    const dbKeywords = [
      "prisma",
      "typeorm",
      "sequelize",
      "mongoose",
      "drizzle",
      "sqlalchemy",
      "django-orm",
      "gorm",
    ];

    return dependencies.filter((dep) =>
      dbKeywords.some((keyword) =>
        dep.name.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * 查找 API 客户端依赖
   */
  private findAPIClientDependencies(dependencies: Dependency[]): Dependency[] {
    const apiKeywords = ["axios", "fetch", "ky", "got", "undici", "node-fetch"];

    return dependencies.filter((dep) =>
      apiKeywords.some((keyword) =>
        dep.name.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * 查找构建工具依赖
   */
  private findBuildToolDependencies(dependencies: Dependency[]): Dependency[] {
    const buildKeywords = [
      "vite",
      "webpack",
      "rollup",
      "esbuild",
      "swc",
      "turbo",
      "nx",
      "turborepo",
    ];

    return dependencies.filter((dep) =>
      buildKeywords.some((keyword) =>
        dep.name.toLowerCase().includes(keyword.toLowerCase())
      )
    );
  }

  /**
   * 生成规则需求摘要
   */
  generateRequirementsSummary(requirements: RuleRequirement[]): string {
    let summary = `## 📋 规则需求分析\n\n`;
    summary += `共识别 ${requirements.length} 个规则需求\n\n`;

    // 按检测来源分组
    const bySource = new Map<string, RuleRequirement[]>();
    for (const req of requirements) {
      if (!bySource.has(req.detectedFrom)) {
        bySource.set(req.detectedFrom, []);
      }
      bySource.get(req.detectedFrom)!.push(req);
    }

    for (const [source, reqs] of bySource) {
      const sourceLabel: Record<string, string> = {
        dependency: "依赖检测",
        "file-structure": "文件结构",
        config: "配置文件",
        "code-analysis": "代码分析",
      };

      summary += `### ${sourceLabel[source] || source} (${reqs.length} 项)\n\n`;
      for (const req of reqs) {
        const confidenceEmoji =
          req.confidence === "high"
            ? "✅"
            : req.confidence === "medium"
            ? "⚠️"
            : "❓";
        summary += `${confidenceEmoji} **${req.ruleFileName}** (优先级: ${req.priority})\n`;
        summary += `  - 原因: ${req.reason}\n`;
        if (req.dependencies && req.dependencies.length > 0) {
          summary += `  - 触发依赖: ${req.dependencies.join(", ")}\n`;
        }
        summary += `\n`;
      }
    }

    return summary;
  }
}
