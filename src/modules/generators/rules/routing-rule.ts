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
      "Frontend Routing Guidelines",
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
# Frontend Routing Guidelines

See also: @global-rules.mdc, @architecture.mdc

## Project Stack

**Routing system**: ${router.info.framework}${
        router.info.version ? ` (${router.info.version})` : ""
      }  
**Route type**: ${getRouterTypeDescription(router.info.type)}  
**Route location**: ${[...new Set(router.info.location)].map((l) => `\`@${l}\``).join(", ")}

${generateFrontendRouterContent(router, context)}

---

*Routing is the skeleton of the application — keep route structure clear.*
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
      "API Routing Guidelines",
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
# API Routing Guidelines

See also: @global-rules.mdc, @architecture.mdc

## Project Stack

**Routing system**: ${router.info.framework}  
**Route type**: ${getRouterTypeDescription(router.info.type)}  
**Route location**: ${[...new Set(router.info.location)].map((l) => `\`@${l}\``).join(", ")}

${generateBackendRouterContent(router, context)}

---

*API routes should follow RESTful design with clear resource organization.*
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
    content += `## Route Organization\n\n`;
    content += `**Organization pattern**: ${getOrganizationDescription(
      pattern.organization
    )}\n`;
    content += `**URL naming**: ${pattern.urlNaming}\n`;
    content += `**File naming**: ${pattern.fileNaming}\n\n`;

    // 实际示例
    if (examples.length > 0) {
      content += `## Route Examples\n\n`;

      const staticRoutes = examples
        .filter((e) => e.type === "static")
        .slice(0, 3);
      if (staticRoutes.length > 0) {
        content += `### Static Routes\n\n`;
        for (const route of staticRoutes) {
          content += `- **@${route.filePath}** → \`${route.url}\`\n`;
        }
        content += `\n`;
      }

      const dynamicRoutes = examples
        .filter((e) => e.type === "dynamic")
        .slice(0, 3);
      if (dynamicRoutes.length > 0) {
        content += `### Dynamic Routes\n\n`;
        for (const route of dynamicRoutes) {
          content += `- **@${route.filePath}** → \`${route.url}\`\n`;
        }
        content += `\n**Parameter access**: See code examples in the actual files\n\n`;
      }
    }

    // 新建路由规范
    content += `## Adding New Routes\n\n`;
    content += generateNewRouteGuidelines(info, pattern, examples, context.techStack.dependencies);

    // 路由特性
    if (pattern.hasRouteGroups) {
      content += `## Route Groups\n\n`;
      content += `The project uses ${pattern.groupPattern} syntax to organize related routes.\n\n`;
      content += `Example: See existing route group structure\n\n`;
    }

    if (pattern.hasGuards) {
      content += `## Route Guards\n\n`;
      content += `The project uses route guards/middleware for access control.\n\n`;
      if (pattern.guardFiles && pattern.guardFiles.length > 0) {
        content += `Reference: @${pattern.guardFiles[0]}\n\n`;
      }
    }

    // 路由懒加载
    if (pattern.usesLazyLoading) {
      content += `## Route Lazy Loading\n\n`;
      content += `The project uses lazy loading for performance.\n\n`;
      content += `✅ Continue using lazy loading for large pages\n\n`;
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
    content += `## API Route Organization\n\n`;
    content += `**Organization pattern**: ${getOrganizationDescription(
      pattern.organization
    )}\n`;
    content += `**URL naming**: ${pattern.urlNaming}\n\n`;

    if (pattern.isDynamicGenerated) {
      content += `⚠️ **Note**: Project routes are dynamically generated via script\n`;
      content += `Generation script: \`${pattern.generationScript}\`\n\n`;
    }

    // 实际 API 示例
    if (examples.length > 0) {
      content += `## API Route Examples\n\n`;

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
      content += `## RESTful API Design\n\n`;
      content += `Project APIs follow RESTful design principles:\n\n`;
      content += `- \`GET /resources\` - List resources\n`;
      content += `- \`GET /resources/:id\` - Get a single resource\n`;
      content += `- \`POST /resources\` - Create a resource\n`;
      content += `- \`PUT /resources/:id\` - Update a resource\n`;
      content += `- \`DELETE /resources/:id\` - Delete a resource\n\n`;
    }

    // 新建 API 规范
    content += `## Adding New API Routes\n\n`;
    content += generateNewAPIRouteGuidelines(info, pattern, examples);

    // 中间件
    if (pattern.hasGuards) {
      content += `## Middleware Usage\n\n`;
      content += `The project uses middleware for authentication, validation, and similar concerns.\n\n`;
      if (pattern.guardFiles) {
        content += `Reference: @${pattern.guardFiles[0]}\n\n`;
      }
    }

    content += `## Short-term Guidelines\n\n`;
    content += `✅ Maintain RESTful API design principles\n`;
    content += `✅ Follow existing route organization patterns\n`;

    return content;
}

/**
 * 根据路由框架类型生成「注册新路由」的代码片段。
 * 基于框架语义生成模板，不依赖读取特定项目文件，具备通用性。
 */
function generateRouteRegistrationSnippet(
  info: RouterInfo,
  pattern: RoutingPattern,
  deps?: Array<{ name: string; version: string }>
): string {
    const framework: string = info.framework ?? '';
    const routerType: string = info.type ?? 'config-based';
    const usesLazy: boolean = !!pattern.usesLazyLoading;

    if (framework.includes('Next.js')) {
      if (info.version === 'App Router') {
        return `\`\`\`
app/
└── feature-name/
    ├── page.tsx        # Page component (required)
    └── layout.tsx      # Layout (optional, affects child routes)
\`\`\``;
      }
      return `\`\`\`
pages/
└── feature-name.tsx    # File-based route: / → /feature-name
\`\`\``;
    }

    if (framework.includes('Vue Router') || framework.includes('Vue')) {
      const lazy = usesLazy
        ? `component: () => import('@/views/FeatureName.vue')`
        : `component: FeatureNameView`;
      return `\`\`\`typescript
// router/index.ts or route config file
{
  path: '/feature-name',
  name: 'FeatureName',
  ${lazy},
}
\`\`\``;
    }

    if (framework.includes('React Router') || routerType === 'config-based') {
      const rrDep = (deps ?? []).find((d) => d.name === 'react-router-dom' || d.name === 'react-router');
      const majorVersion = rrDep?.version ? parseInt(rrDep.version.replace(/^[\^~>=]*/, ''), 10) : 6;

      if (majorVersion >= 6) {
        const lazy = usesLazy
          ? `element: React.lazy(() => import('@/views/FeatureName'))`
          : `element: <FeatureName />`;
        return `\`\`\`tsx
// src/router/index.tsx or route config file
{
  path: '/feature-name',
  ${lazy},
}
\`\`\``;
      }

      // React Router v5 and below: component prop + <Switch>
      const lazy5 = usesLazy
        ? `component: React.lazy(() => import('@/views/FeatureName'))`
        : `component: FeatureName`;
      return `\`\`\`tsx
// src/router/index.tsx or route config file
<Switch>
  <Route path="/feature-name" ${lazy5} />
</Switch>
\`\`\``;
    }

    // 通用 fallback
    return `\`\`\`typescript
// Add a new route entry in the route config file
{ path: '/feature-name', component: FeaturePage }
\`\`\``;
}

function generateNewRouteGuidelines(
  info: RouterInfo,
  pattern: RoutingPattern,
  examples: RouteExample[],
  deps?: Array<{ name: string; version: string }>
): string {
    let guidelines = "";

    if (info.framework.includes("Next.js")) {
      if (info.version === "App Router") {
        guidelines += `### Steps\n\n`;
        guidelines += `1. Determine the route path under the \`app/\` directory\n`;
        guidelines += `2. Create a folder (URL path segment)\n`;
        guidelines += `3. Create \`page.tsx\` (page component)\n`;
        if (pattern.supportsLayouts) {
          guidelines += `4. If a layout is needed, create \`layout.tsx\`\n`;
        }
        guidelines += `\n`;
        guidelines += `### Route Registration Format\n\n`;
        guidelines += generateRouteRegistrationSnippet(info, pattern, deps);
        guidelines += `\n\n`;

        if (examples.length > 0) {
          guidelines += `Reference example: @${examples[0].filePath}\n\n`;
        }
      }
    } else if (info.framework === "React Router") {
      const configFile = info.location[0] || "src/router/";
      guidelines += `### Adding a Route\n\n`;
      guidelines += `1. Add a route definition in the route config directory \`${configFile}\`\n`;
      guidelines += `2. Create the corresponding page component\n`;
      if (pattern.usesLazyLoading) {
        guidelines += `3. Use lazy loading for large pages\n`;
      }
      guidelines += `\n`;
      if (examples.length > 0) {
        guidelines += `### Existing Route Examples\n\n`;
        guidelines += `Reference existing route config: \`@${examples[0].filePath}\`\n\n`;
        guidelines += `Existing route paths:\n`;
        for (const ex of examples.slice(0, 5)) {
          guidelines += `- \`${ex.url}\`${ex.type === "dynamic" ? " (dynamic)" : ""}\n`;
        }
        guidelines += `\n`;
      } else {
        guidelines += `### Route Registration Format\n\n`;
        guidelines += generateRouteRegistrationSnippet(info, pattern, deps);
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
      guidelines += `### Steps\n\n`;
      guidelines += `1. Create or select a module file in the \`routes/\` directory\n`;
      guidelines += `2. Define route handlers\n`;
      guidelines += `3. Export using \`express.Router()\`\n`;
      guidelines += `4. Register the route in the main entry file\n\n`;

      if (examples.length > 0) {
        guidelines += `Reference example: @${examples[0].filePath}\n\n`;
      }
    } else if (info.framework === "Django") {
      guidelines += `### Steps\n\n`;
      guidelines += `1. Add routes in the app's \`urls.py\`\n`;
      guidelines += `2. Create the corresponding view functions\n`;
      guidelines += `3. Include app routes in the main \`urls.py\`\n\n`;
    }

    return guidelines;
}

/**
 * 生成动态路由章节（带确定性标注）
 */
function generateDynamicRoutingSection(analysis: DynamicRoutingAnalysis): string {
    let section = `## Route Generation\n\n`;

    const certaintyLabels: Record<string, string> = {
      certain: "✅ [Confirmed]",
      likely: "⚠️ [Likely]",
      uncertain: "ℹ️ [Uncertain]",
    };

    const label =
      certaintyLabels[analysis.recommendation.certainty] || "ℹ️ [Unknown]";
    section += `### ${label} ${analysis.recommendation.explanation}\n\n`;

    if (analysis.documentation.found) {
      // 基于文档
      section += `**Documentation source**: @${analysis.documentation.file}\n\n`;
      section += `Project documentation states:\n`;
      section += `> ${(analysis.documentation.section ?? "").slice(0, 200)}...\n\n`;
      section += `**Generation method**: \`${analysis.recommendation.method}\`\n\n`;

      if (analysis.documentation.file) {
        section += `See also: routing section in @${analysis.documentation.file}\n\n`;
      }
    } else if (
      analysis.recommendation.certainty === "certain" ||
      analysis.recommendation.certainty === "likely"
    ) {
      // 基于高置信度检测
      section += `**Detected method**: \`${analysis.recommendation.method}\`\n\n`;

      if (analysis.scripts.files.length > 0) {
        section += `**Script file**: @${analysis.scripts.files[0]}\n`;
      }

      section += `\n**Usage**:\n`;
      section += `\`\`\`bash\n${analysis.recommendation.method}\n\`\`\`\n\n`;
    } else {
      // 不确定
      section += `The project may use scripts to generate routes dynamically, but this could not be fully confirmed.\n\n`;

      section += `**Possible options**:\n`;
      if (analysis.scripts.commands.length > 0) {
        section += `Commands:\n`;
        for (const cmd of analysis.scripts.commands) {
          section += `- \`${cmd}\`\n`;
        }
      }
      if (analysis.scripts.files.length > 0) {
        section += `Scripts:\n`;
        for (const file of analysis.scripts.files) {
          section += `- @${file}\n`;
        }
      }

      section += `\n**Current assumption**: Use \`${analysis.recommendation.method}\`\n`;
      section += `(${analysis.recommendation.explanation})\n\n`;

      section += `❓ **Please confirm**: If this is incorrect, provide the correct approach and this rule will be updated.\n\n`;
    }

    if (analysis.recommendation.certainty === "certain") {
      section += `✅ **When adding routes**: Use the method above to generate routes and stay consistent.\n\n`;
    } else {
      section += `⚠️ **When adding routes**: Confirm the correct generation approach first, then use it.\n\n`;
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
