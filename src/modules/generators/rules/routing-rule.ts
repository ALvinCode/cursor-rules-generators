/**
 * 路由规范规则生成器（前端 + 后端）
 *
 * 基于项目实际检测到的路由框架、组织方式与示例生成约定。
 * 这是一组自包含函数：两个入口（前端/后端路由规则）+ 内部内容生成 helper。
 */

import {
  CursorRule,
  RuleGenerationContext,
  RouterInfo,
  RoutingPattern,
  RouteExample,
  DynamicRoutingAnalysis,
} from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import {
  getRouteGlobs,
  getRouterTypeDescription,
  getOrganizationDescription,
} from "./rule-helpers.js";

export function generateFrontendRoutingRule(
  context: RuleGenerationContext
): CursorRule {
    const router = context.frontendRouter!;
    const routeGlobs = getRouteGlobs(router, "frontend");
    const metadata = buildRuleMetadata(
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
**路由类型**: ${getRouterTypeDescription(router.info.type)}  
**路由位置**: ${[...new Set(router.info.location)].map((l) => `\`@${l}\``).join(", ")}

${generateFrontendRouterContent(router, context)}

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

export function generateBackendRoutingRule(
  context: RuleGenerationContext
): CursorRule {
    const router = context.backendRouter!;
    const apiRouteGlobs = getRouteGlobs(router, "backend");
    const metadata = buildRuleMetadata(
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
**路由类型**: ${getRouterTypeDescription(router.info.type)}  
**路由位置**: ${[...new Set(router.info.location)].map((l) => `\`@${l}\``).join(", ")}

${generateBackendRouterContent(router, context)}

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

function generateFrontendRouterContent(
  router: { info: RouterInfo; pattern: RoutingPattern; examples: RouteExample[]; dynamicAnalysis?: DynamicRoutingAnalysis },
  context: RuleGenerationContext
): string {
    const { info, pattern, examples } = router;
    let content = "";

    const dynamicAnalysis = router.dynamicAnalysis;
    if (dynamicAnalysis && dynamicAnalysis.isDynamic) {
      content += generateDynamicRoutingSection(dynamicAnalysis);
    }

    // 路由组织方式
    content += `## 路由组织方式\n\n`;
    content += `**组织模式**: ${getOrganizationDescription(
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
    content += generateNewRouteGuidelines(info, pattern, examples);

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

function generateBackendRouterContent(
  router: { info: RouterInfo; pattern: RoutingPattern; examples: RouteExample[] },
  context: RuleGenerationContext
): string {
    const { info, pattern, examples } = router;
    let content = "";

    // API 路由组织
    content += `## API 路由组织\n\n`;
    content += `**组织模式**: ${getOrganizationDescription(
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

      const grouped = groupExamplesByFile(examples);
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
    content += generateNewAPIRouteGuidelines(info, pattern, examples);

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
 * 根据路由框架类型生成「注册新路由」的代码片段。
 * 基于框架语义生成模板，不依赖读取特定项目文件，具备通用性。
 */
function generateRouteRegistrationSnippet(info: RouterInfo, pattern: RoutingPattern): string {
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

function generateNewRouteGuidelines(
  info: RouterInfo,
  pattern: RoutingPattern,
  examples: RouteExample[]
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
        guidelines += generateRouteRegistrationSnippet(info, pattern);
        guidelines += `\n\n`;

        if (examples.length > 0) {
          guidelines += `参考示例: @${examples[0].filePath}\n\n`;
        }
      }
    } else if (info.framework === "React Router") {
      const configFile = info.location[0] || "src/router/";
      guidelines += `### 新增路由\n\n`;
      guidelines += `1. 在路由配置目录 \`${configFile}\` 中添加路由定义\n`;
      guidelines += `2. 创建对应的页面组件\n`;
      if (pattern.usesLazyLoading) {
        guidelines += `3. 大型页面使用懒加载\n`;
      }
      guidelines += `\n`;
      if (examples.length > 0) {
        guidelines += `### 现有路由示例\n\n`;
        guidelines += `参考已有路由配置文件: \`@${examples[0].filePath}\`\n\n`;
        guidelines += `现有路由路径:\n`;
        for (const ex of examples.slice(0, 5)) {
          guidelines += `- \`${ex.url}\`${ex.type === "dynamic" ? " (动态)" : ""}\n`;
        }
        guidelines += `\n`;
      } else {
        guidelines += `### 路由注册格式\n\n`;
        guidelines += generateRouteRegistrationSnippet(info, pattern);
        guidelines += `\n\n`;
      }
    }

    return guidelines;
}

function generateNewAPIRouteGuidelines(
  info: RouterInfo,
  pattern: RoutingPattern,
  examples: RouteExample[]
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
 * 生成动态路由章节（带确定性标注）
 */
function generateDynamicRoutingSection(analysis: DynamicRoutingAnalysis): string {
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
      section += `> ${(analysis.documentation.section ?? "").slice(0, 200)}...\n\n`;
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
function groupExamplesByFile(examples: RouteExample[]): Record<string, RouteExample[]> {
    const grouped: Record<string, RouteExample[]> = {};
    for (const example of examples) {
      if (!grouped[example.filePath]) {
        grouped[example.filePath] = [];
      }
      grouped[example.filePath].push(example);
    }
    return grouped;
}
