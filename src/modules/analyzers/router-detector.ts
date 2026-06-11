import * as path from 'path';

import { FileUtils } from '../../utils/file-utils.js';
import { RouterInfo, RoutingPattern, RouteExample } from '../../types.js';

/**
 * 路由检测器
 * 通用的路由系统检测，支持前端和后端各种路由方案
 *
 * 路由相关类型 (`RouterInfo`, `RoutingPattern`, `RouteExample`) 统一由
 * `types.ts` 提供，本模块直接 re-export 它们以保持向后兼容的导入路径。
 */

export type { RouterInfo, RoutingPattern, RouteExample };

export class RouterDetector {
  /**
   * 检测前端路由（增强版：同时检查依赖和文件结构）
   */
  async detectFrontendRouter(
    projectPath: string,
    files: string[],
    dependencies?: Array<{ name: string; version?: string }>
  ): Promise<RouterInfo | null> {
    const depNames = new Set(
      (dependencies ?? []).map((d) => d.name.toLowerCase())
    );

    // 首先从文件结构检测
    const fileBasedRouter = await this.detectFrontendRouterFromFiles(
      projectPath,
      files,
      depNames
    );
    if (fileBasedRouter) {
      return fileBasedRouter;
    }

    // 如果文件结构未检测到，从依赖中检测
    if (dependencies && dependencies.length > 0) {
      const dependencyBasedRouter =
        this.detectFrontendRouterFromDependencies(dependencies);
      if (dependencyBasedRouter) {
        return dependencyBasedRouter;
      }
    }

    return null;
  }

  /**
   * 从文件结构检测前端路由（原有逻辑）
   */
  private async detectFrontendRouterFromFiles(
    projectPath: string,
    files: string[],
    depNames: Set<string> = new Set()
  ): Promise<RouterInfo | null> {
    // 1. 检测 Next.js App Router（需 next 依赖 + app/page.tsx 结构）
    if (depNames.has("next")) {
      const appRouterFiles = files.filter(
        (f) => f.includes("/app/") && f.endsWith("/page.tsx")
      );
      if (appRouterFiles.length > 0) {
        return {
          exists: true,
          type: "file-based",
          framework: "Next.js",
          version: "App Router",
          location: ["app/"],
        };
      }

      // 2. 检测 Next.js Pages Router（需 next 依赖 + pages/ 结构）
      const pagesRouterFiles = files.filter(
        (f) =>
          f.includes("/pages/") &&
          /\.(tsx?|jsx?)$/.test(f) &&
          !f.includes("_app") &&
          !f.includes("_document")
      );
      if (pagesRouterFiles.length > 0) {
        return {
          exists: true,
          type: "file-based",
          framework: "Next.js",
          version: "Pages Router",
          location: ["pages/"],
        };
      }
    }

    // 3. 检测 Nuxt（需 nuxt 依赖 + pages/*.vue 结构）
    if (depNames.has("nuxt") || depNames.has("nuxt3")) {
      const nuxtPagesFiles = files.filter(
        (f) => f.includes("/pages/") && f.endsWith(".vue")
      );
      if (nuxtPagesFiles.length > 0) {
        return {
          exists: true,
          type: "file-based",
          framework: "Nuxt",
          location: ["pages/"],
        };
      }
    }

    // 4. 检测 React Router（配置式）
    const reactRouterConfig = files.find(
      (f) => f.includes("router") || f.includes("routes")
    );
    if (reactRouterConfig) {
      const content = await FileUtils.readFile(reactRouterConfig);
      if (
        content.includes("react-router") ||
        content.includes("createBrowserRouter") ||
        content.includes("<Routes>")
      ) {
        return {
          exists: true,
          type: "config-based",
          framework: "React Router",
          location: [this.relDir(projectPath, reactRouterConfig)],
        };
      }
    }

    // 5. 检测 Vue Router
    const vueRouterConfig = files.find(
      (f) => f.includes("router") && (f.endsWith(".js") || f.endsWith(".ts"))
    );
    if (vueRouterConfig) {
      const content = await FileUtils.readFile(vueRouterConfig);
      if (content.includes("vue-router") || content.includes("createRouter")) {
        return {
          exists: true,
          type: "config-based",
          framework: "Vue Router",
          location: [this.relDir(projectPath, vueRouterConfig)],
        };
      }
    }

    // 6. 检测 Remix（需 @remix-run/* 或 remix 依赖 + routes/ 结构）
    if (
      depNames.has("@remix-run/react") ||
      depNames.has("@remix-run/node") ||
      depNames.has("remix")
    ) {
      const remixRoutes = files.filter(
        (f) => f.includes("/routes/") && f.endsWith(".tsx")
      );
      if (remixRoutes.length > 0) {
        return {
          exists: true,
          type: "file-based",
          framework: "Remix",
          location: ["app/routes/"],
        };
      }
    }

    return null;
  }

  /**
   * 从依赖中检测前端路由
   */
  private detectFrontendRouterFromDependencies(
    dependencies: Array<{ name: string; version?: string }>
  ): RouterInfo | null {
    const depNames = dependencies.map((d) => d.name.toLowerCase());

    // Next.js
    if (depNames.some((name) => name === "next")) {
      // 默认假设使用 App Router（较新）
      return {
        exists: true,
        type: "file-based",
        framework: "Next.js",
        version: "App Router",
        location: ["app/"],
      };
    }

    // Nuxt
    if (depNames.some((name) => name === "nuxt" || name.startsWith("nuxt-"))) {
      return {
        exists: true,
        type: "file-based",
        framework: "Nuxt",
        location: ["pages/"],
      };
    }

    // Remix
    if (
      depNames.some((name) => name === "@remix-run/react" || name === "remix")
    ) {
      return {
        exists: true,
        type: "file-based",
        framework: "Remix",
        location: ["app/routes/"],
      };
    }

    // SvelteKit
    if (depNames.some((name) => name === "@sveltejs/kit")) {
      return {
        exists: true,
        type: "file-based",
        framework: "SvelteKit",
        location: ["src/routes/"],
      };
    }

    // React Router
    if (
      depNames.some(
        (name) =>
          name === "react-router" ||
          name === "react-router-dom" ||
          name.startsWith("@react-router/")
      )
    ) {
      return {
        exists: true,
        type: "config-based",
        framework: "React Router",
        location: ["src/"],
      };
    }

    // Vue Router
    if (depNames.some((name) => name === "vue-router")) {
      return {
        exists: true,
        type: "config-based",
        framework: "Vue Router",
        location: ["src/"],
      };
    }

    return null;
  }

  /**
   * 检测后端 API 路由（增强版：同时检查依赖和文件结构）
   */
  async detectBackendRouter(
    projectPath: string,
    files: string[],
    dependencies?: Array<{ name: string; version?: string }>
  ): Promise<RouterInfo | null> {
    const depNames = new Set(
      (dependencies ?? []).map((d) => d.name.toLowerCase())
    );

    // 首先从文件结构检测
    const fileBasedRouter = await this.detectBackendRouterFromFiles(
      projectPath,
      files,
      depNames
    );
    if (fileBasedRouter) {
      return fileBasedRouter;
    }

    // 如果文件结构未检测到，从依赖中检测
    if (dependencies && dependencies.length > 0) {
      const dependencyBasedRouter =
        this.detectBackendRouterFromDependencies(dependencies);
      if (dependencyBasedRouter) {
        return dependencyBasedRouter;
      }
    }

    return null;
  }

  /**
   * 从文件结构检测后端路由（原有逻辑）
   */
  private async detectBackendRouterFromFiles(
    projectPath: string,
    files: string[],
    depNames: Set<string> = new Set()
  ): Promise<RouterInfo | null> {
    // 1. 检测 Express（需 express 依赖 + 文件内容验证）
    if (depNames.has("express")) {
      const expressRoutes = files.filter((f) => {
        return (
          f.includes("/routes/") ||
          f.includes("/api/") ||
          f.includes("/controllers/")
        );
      });

      for (const file of expressRoutes.slice(0, 10)) {
        const content = await FileUtils.readFile(file);
        if (
          content.includes("express.Router") ||
          content.includes("router.get(") ||
          content.includes("app.get(")
        ) {
          return {
            exists: true,
            type: "programmatic",
            framework: "Express",
            location: expressRoutes
              .map((f) => this.relDir(projectPath, f))
              .filter((v, i, a) => a.indexOf(v) === i)
              .slice(0, 3),
          };
        }
      }
    }

    // 2. 检测 Fastify（需 fastify 依赖 + 文件内容验证）
    if (depNames.has("fastify")) {
      for (const file of files.slice(0, 20)) {
        const content = await FileUtils.readFile(file);
        if (
          content.includes("fastify.route") ||
          content.includes("fastify.get")
        ) {
          return {
            exists: true,
            type: "programmatic",
            framework: "Fastify",
            location: ["src/routes/"],
          };
        }
      }
    }

    // 3. 检测 NestJS（需 @nestjs/core 依赖 + 内容验证）
    if (depNames.has("@nestjs/core") || depNames.has("@nestjs/common")) {
      const nestControllers = files.filter(
        (f) => f.includes("controller") && f.endsWith(".ts")
      );
      if (nestControllers.length > 0) {
        const content = await FileUtils.readFile(nestControllers[0]);
        if (content.includes("@Controller") || content.includes("@nestjs")) {
          return {
            exists: true,
            type: "programmatic",
            framework: "NestJS",
            location: nestControllers.map((f) => this.relDir(projectPath, f)).slice(0, 3),
          };
        }
      }
    }

    // 4. 检测 Django（需 django 依赖 + urls.py 文件）
    if (depNames.has("django")) {
      const djangoUrls = files.filter((f) => f.endsWith("urls.py"));
      if (djangoUrls.length > 0) {
        return {
          exists: true,
          type: "config-based",
          framework: "Django",
          location: djangoUrls.map((f) => this.relDir(projectPath, f)),
        };
      }
    }

    // 5. 检测 Flask（需 flask 依赖 + 文件内容验证）
    if (depNames.has("flask")) {
      for (const file of files.filter((f) => f.endsWith(".py")).slice(0, 20)) {
        const content = await FileUtils.readFile(file);
        if (content.includes("@app.route") || content.includes("@bp.route")) {
          return {
            exists: true,
            type: "programmatic",
            framework: "Flask",
            location: ["app/"],
          };
        }
      }
    }

    return null;
  }

  /**
   * 从依赖中检测后端路由
   */
  private detectBackendRouterFromDependencies(
    dependencies: Array<{ name: string; version?: string }>
  ): RouterInfo | null {
    const depNames = dependencies.map((d) => d.name.toLowerCase());

    // Express
    if (depNames.some((name) => name === "express")) {
      return {
        exists: true,
        type: "programmatic",
        framework: "Express",
        location: ["src/routes/", "src/api/"],
      };
    }

    // Fastify
    if (depNames.some((name) => name === "fastify")) {
      return {
        exists: true,
        type: "programmatic",
        framework: "Fastify",
        location: ["src/routes/"],
      };
    }

    // Koa
    if (depNames.some((name) => name === "koa")) {
      return {
        exists: true,
        type: "programmatic",
        framework: "Koa",
        location: ["src/routes/"],
      };
    }

    // NestJS
    if (
      depNames.some(
        (name) => name === "@nestjs/core" || name === "@nestjs/common"
      )
    ) {
      return {
        exists: true,
        type: "programmatic",
        framework: "NestJS",
        location: ["src/"],
      };
    }

    // Django
    if (depNames.some((name) => name === "django")) {
      return {
        exists: true,
        type: "config-based",
        framework: "Django",
        location: [""],
      };
    }

    // Flask
    if (depNames.some((name) => name === "flask")) {
      return {
        exists: true,
        type: "programmatic",
        framework: "Flask",
        location: ["app/"],
      };
    }

    // Gin (Go)
    if (depNames.some((name) => name === "github.com/gin-gonic/gin")) {
      return {
        exists: true,
        type: "programmatic",
        framework: "Gin",
        location: [""],
      };
    }

    return null;
  }

  /**
   * 将文件绝对路径转为相对于项目根的目录路径（以 / 结尾）
   */
  private relDir(projectPath: string, filePath: string): string {
    const dir = path.dirname(filePath);
    const rel = path.relative(projectPath, dir);
    return rel ? `${rel}/` : '';
  }

  /**
   * 分析路由模式（通用）
   */
  async analyzeRoutingPattern(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<RoutingPattern> {
    if (routerInfo.framework.includes("Next.js")) {
      return this.analyzeNextJsPattern(projectPath, files, routerInfo);
    } else if (routerInfo.framework === "React Router") {
      return this.analyzeReactRouterPattern(projectPath, files, routerInfo);
    } else if (routerInfo.framework === "Vue Router") {
      return this.analyzeVueRouterPattern(projectPath, files, routerInfo);
    } else if (routerInfo.framework === "Express") {
      return this.analyzeExpressPattern(projectPath, files, routerInfo);
    } else if (routerInfo.framework === "Django") {
      return this.analyzeDjangoPattern(projectPath, files, routerInfo);
    }

    // 默认模式
    return this.analyzeGenericPattern(projectPath, files, routerInfo);
  }

  /**
   * 分析 Next.js 路由模式
   */
  private async analyzeNextJsPattern(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<RoutingPattern> {
    const isAppRouter = routerInfo.version === "App Router";
    const routeDir = isAppRouter ? "app" : "pages";
    const routeFiles = files.filter((f) => f.includes(`/${routeDir}/`));

    // 检测动态路由模式
    const dynamicRoutes = routeFiles.filter(
      (f) => f.includes("[") && f.includes("]")
    );
    const dynamicPattern = dynamicRoutes.length > 0 ? "[id]" : "none";

    // 检测路由分组（App Router 特性）
    const hasGroups = routeFiles.some(
      (f) => f.includes("(") && f.includes(")")
    );

    // 检测布局
    const hasLayouts = routeFiles.some((f) => f.includes("layout."));

    // 检测中间件
    const hasMiddleware = files.some((f) => f.includes("middleware."));

    // 检测懒加载（通过 dynamic import）
    let usesLazyLoad = false;
    for (const file of routeFiles.slice(0, 10)) {
      const content = await FileUtils.readFile(file);
      if (content.includes("dynamic(") || content.includes("lazy(")) {
        usesLazyLoad = true;
        break;
      }
    }

    // URL 命名模式分析
    const urlNaming = this.analyzeUrlNaming(routeFiles);

    return {
      organization: hasGroups ? "feature-based" : "distributed",
      urlNaming,
      fileNaming: isAppRouter ? "page.tsx" : "[name].tsx",
      dynamicRoutePattern: dynamicPattern,
      dynamicRouteExamples: dynamicRoutes
        .slice(0, 3)
        .map((f) => FileUtils.getRelativePath(projectPath, f)),
      hasRouteGroups: hasGroups,
      groupPattern: hasGroups ? "(group)" : undefined,
      supportsLayouts: hasLayouts,
      layoutPattern: hasLayouts ? "layout.tsx" : undefined,
      hasGuards: hasMiddleware,
      guardFiles: hasMiddleware ? ["middleware.ts"] : undefined,
      usesLazyLoading: usesLazyLoad,
      hasRouteMeta: false,
      navigationMethod: "useRouter",
      isDynamicGenerated: false,
    };
  }

  /**
   * 分析 React Router 模式
   */
  private async analyzeReactRouterPattern(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<RoutingPattern> {
    const routerConfigFile = files.find(
      (f) => f.includes("router") || f.includes("routes")
    );

    if (!routerConfigFile) {
      return this.getDefaultPattern();
    }

    const content = await FileUtils.readFile(routerConfigFile);

    // 检测动态路由
    const hasDynamicRoutes =
      content.includes(":id") || content.includes(":slug");
    const dynamicPattern = hasDynamicRoutes ? ":id" : "none";

    // 检测嵌套路由
    const hasNesting =
      content.includes("children:") || content.includes("<Outlet");

    // 检测路由守卫
    const hasGuards =
      content.includes("loader") ||
      content.includes("beforeEnter") ||
      content.includes("ProtectedRoute");

    // 检测懒加载
    const usesLazyLoad =
      content.includes("React.lazy") || content.includes("lazy(");

    return {
      organization: "centralized",
      urlNaming: "kebab-case",
      fileNaming: "config-based",
      dynamicRoutePattern: dynamicPattern,
      dynamicRouteExamples: [],
      hasRouteGroups: false,
      supportsLayouts: hasNesting,
      hasGuards,
      guardFiles: hasGuards ? [routerConfigFile] : undefined,
      usesLazyLoading: usesLazyLoad,
      hasRouteMeta: content.includes("meta:"),
      navigationMethod: "useNavigate",
      isDynamicGenerated: false,
    };
  }

  /**
   * 分析 Vue Router 模式
   */
  private async analyzeVueRouterPattern(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<RoutingPattern> {
    // 类似 React Router 的分析逻辑
    const routerConfigFile = files.find(
      (f) => f.includes("router") && f.endsWith(".ts")
    );

    if (!routerConfigFile) {
      return this.getDefaultPattern();
    }

    const content = await FileUtils.readFile(routerConfigFile);

    return {
      organization: "centralized",
      urlNaming: "kebab-case",
      fileNaming: "config-based",
      dynamicRoutePattern: content.includes(":id") ? ":id" : "none",
      dynamicRouteExamples: [],
      hasRouteGroups: false,
      supportsLayouts: true,
      hasGuards: content.includes("beforeEnter") || content.includes("meta:"),
      usesLazyLoading: content.includes("() => import"),
      hasRouteMeta: content.includes("meta:"),
      navigationMethod: "router.push",
      isDynamicGenerated: false,
    };
  }

  /**
   * 分析 Express 路由模式
   */
  private async analyzeExpressPattern(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<RoutingPattern> {
    const routeFiles = files.filter(
      (f) =>
        (f.includes("/routes/") || f.includes("/api/")) && /\.(ts|js)$/.test(f)
    );

    let hasMiddleware = false;
    let usesRESTful = false;
    const dynamicExamples: string[] = [];

    for (const file of routeFiles.slice(0, 10)) {
      const content = await FileUtils.readFile(file);

      // 检测中间件
      if (content.includes(".use(") || content.includes("middleware")) {
        hasMiddleware = true;
      }

      // 检测 RESTful 模式
      if (
        content.includes(".get(") &&
        content.includes(".post(") &&
        content.includes(".put(")
      ) {
        usesRESTful = true;
      }

      // 检测动态路由
      const dynamicMatches = content.match(/['"]\/[\w/]*:[\w]+/g);
      if (dynamicMatches) {
        dynamicExamples.push(...dynamicMatches.slice(0, 2));
      }
    }

    return {
      organization: routeFiles.length > 5 ? "distributed" : "centralized",
      urlNaming: "kebab-case",
      fileNaming: "module files",
      dynamicRoutePattern: ":id",
      dynamicRouteExamples: dynamicExamples.slice(0, 3),
      hasRouteGroups: false,
      supportsLayouts: false,
      hasGuards: hasMiddleware,
      guardFiles: hasMiddleware ? ["middleware/"] : undefined,
      usesLazyLoading: false,
      hasRouteMeta: false,
      isDynamicGenerated: false,
    };
  }

  /**
   * 分析 Django 路由模式
   */
  private async analyzeDjangoPattern(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<RoutingPattern> {
    const urlFiles = files.filter((f) => f.endsWith("urls.py"));

    const dynamicExamples: string[] = [];

    for (const file of urlFiles) {
      const content = await FileUtils.readFile(file);

      // 检测动态路由
      const dynamicMatches = content.match(/<[\w]+>/g);
      if (dynamicMatches) {
        dynamicExamples.push(...dynamicMatches.slice(0, 2));
      }
    }

    return {
      organization: urlFiles.length > 1 ? "distributed" : "centralized",
      urlNaming: "kebab-case",
      fileNaming: "urls.py",
      dynamicRoutePattern: "<id>",
      dynamicRouteExamples: dynamicExamples.slice(0, 3),
      hasRouteGroups: false,
      supportsLayouts: false,
      hasGuards: false, // Django 的权限检查在视图层
      usesLazyLoading: false,
      hasRouteMeta: false,
      isDynamicGenerated: false,
    };
  }

  /**
   * 通用模式分析
   */
  private async analyzeGenericPattern(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<RoutingPattern> {
    return this.getDefaultPattern();
  }

  /**
   * 分析 URL 命名模式
   */
  private analyzeUrlNaming(
    routeFiles: string[]
  ): "kebab-case" | "camelCase" | "snake_case" | "mixed" {
    let kebabCount = 0;
    let camelCount = 0;
    let snakeCount = 0;

    for (const file of routeFiles) {
      const segments = file.split("/");
      for (const seg of segments) {
        if (seg.includes("-")) kebabCount++;
        if (seg.match(/[a-z][A-Z]/)) camelCount++;
        if (seg.includes("_")) snakeCount++;
      }
    }

    const total = kebabCount + camelCount + snakeCount;
    if (total === 0) return "kebab-case";

    if (kebabCount / total > 0.6) return "kebab-case";
    if (camelCount / total > 0.6) return "camelCase";
    if (snakeCount / total > 0.6) return "snake_case";

    return "mixed";
  }

  /**
   * 提取路由示例
   */
  async extractRouteExamples(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo,
    pattern: RoutingPattern
  ): Promise<RouteExample[]> {
    const examples: RouteExample[] = [];

    if (routerInfo.type === "file-based") {
      // 文件系统路由
      const routeFiles = files.filter((f) =>
        routerInfo.location.some((loc) => f.includes(loc))
      );

      for (const file of routeFiles.slice(0, 10)) {
        const url = this.inferUrlFromFile(file, routerInfo);
        const isDynamic = file.includes("[") || file.includes(":");

        examples.push({
          filePath: FileUtils.getRelativePath(projectPath, file),
          url,
          type: isDynamic ? "dynamic" : "static",
        });
      }
    } else if (routerInfo.type === "config-based") {
      // 配置式路由：读取路由配置文件提取实际路由定义
      await this.extractConfigBasedRoutes(
        files, routerInfo, examples, projectPath
      );
    } else if (routerInfo.type === "programmatic") {
      // 编程式路由（后端API）
      await this.extractProgrammaticRoutes(
        files,
        routerInfo,
        examples,
        projectPath
      );
    }

    return examples.slice(0, 10);
  }

  /**
   * 从文件路径推断 URL
   */
  private inferUrlFromFile(filePath: string, routerInfo: RouterInfo): string {
    const routeDir = routerInfo.location[0];
    let relativePath = filePath.split(routeDir).pop() || "";

    // 移除文件名部分
    relativePath = relativePath.replace(/\/(page|index)\.(tsx?|jsx?|vue)$/, "");

    // 处理动态路由
    relativePath = relativePath.replace(/\[([^\]]+)\]/g, ":$1");

    // 处理路由分组
    relativePath = relativePath.replace(/\/\([^)]+\)/g, "");

    return "/" + relativePath.replace(/^\//, "");
  }

  /**
   * 提取配置式路由（React Router 配置文件、Vue Router 等）
   */
  private async extractConfigBasedRoutes(
    files: string[],
    routerInfo: RouterInfo,
    examples: RouteExample[],
    projectPath: string
  ): Promise<void> {
    // 找到路由配置文件
    const routerFile = files.find((f) =>
      routerInfo.location.some((loc) => f.includes(loc)) &&
      (f.includes("router") || f.includes("routes")) &&
      /\.(ts|tsx|js|jsx)$/.test(f)
    );
    if (!routerFile) return;

    const content = await FileUtils.readFile(routerFile);
    // 提取 path: '/xxx' 模式
    const pathMatches = content.matchAll(/path:\s*['"]([^'"]+)['"]/g);
    for (const match of pathMatches) {
      const url = match[1];
      if (url === "*" || url === "/") continue;
      examples.push({
        filePath: FileUtils.getRelativePath(projectPath, routerFile),
        url,
        type: url.includes(":") || url.includes("*") ? "dynamic" : "static",
      });
      if (examples.length >= 10) break;
    }
  }

  /**
   * 提取编程式路由（后端）
   */
  private async extractProgrammaticRoutes(
    files: string[],
    routerInfo: RouterInfo,
    examples: RouteExample[],
    projectPath: string
  ): Promise<void> {
    const routeFiles = files.filter((f) =>
      routerInfo.location.some((loc) => f.includes(loc))
    );

    for (const file of routeFiles.slice(0, 5)) {
      const content = await FileUtils.readFile(file);

      // 提取 Express/Fastify 路由
      const routeMatches = content.matchAll(
        /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g
      );

      for (const match of routeMatches) {
        const [, method, url] = match;
        examples.push({
          filePath: FileUtils.getRelativePath(projectPath, file),
          url,
          type: url.includes(":") ? "dynamic" : "static",
          method: method.toUpperCase(),
        });

        if (examples.length >= 10) break;
      }
    }
  }

  /**
   * 完整的动态路由分析（6 步流程）
   */
  async analyzeDynamicRouting(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<DynamicRoutingAnalysis> {
    // 步骤 1：判断是否动态生成
    const isDynamic = await this.isDynamicallyGenerated(
      projectPath,
      files,
      routerInfo
    );

    if (!isDynamic) {
      return {
        isDynamic: false,
        confidence: "certain",
        documentation: { found: false },
        scripts: { files: [], commands: [], confidence: "high" },
        needsConfirmation: false,
        confirmationQuestions: [],
        recommendation: {
          certainty: "certain",
          method: "手动创建路由",
          explanation: "项目使用标准的路由创建方式",
        },
      };
    }

    // 步骤 3：查询文档说明
    const documentation = await this.checkDocumentation(projectPath);

    if (documentation.found && documentation.method) {
      // 有明确的文档说明 - 确定性高
      return {
        isDynamic: true,
        confidence: "certain",
        documentation,
        scripts: { files: [], commands: [], confidence: "high" },
        needsConfirmation: false,
        confirmationQuestions: [],
        recommendation: {
          certainty: "certain",
          method: documentation.method,
          explanation: `基于项目文档 @${documentation.file} 的说明`,
          source: `@${documentation.file}`,
        },
      };
    }

    // 步骤 5：查找脚本文件
    const scriptsAnalysis = await this.findGenerationScripts(
      projectPath,
      files
    );
    const commandsAnalysis = await this.findGenerationCommands(projectPath);

    const allScripts = {
      files: scriptsAnalysis.scripts,
      commands: commandsAnalysis.commands,
      confidence: this.evaluateOverallConfidence(
        scriptsAnalysis,
        commandsAnalysis
      ),
    };

    // 步骤 6：生成确认问题
    const needsConfirmation = allScripts.confidence !== "high";
    const confirmationQuestions = needsConfirmation
      ? this.generateConfirmationQuestions(allScripts, documentation)
      : [];

    // 选择最佳猜测
    const bestGuess =
      commandsAnalysis.commands[0] || scriptsAnalysis.scripts[0] || "未知";

    return {
      isDynamic: true,
      confidence: allScripts.confidence === "high" ? "likely" : "uncertain",
      documentation,
      scripts: allScripts,
      needsConfirmation,
      confirmationQuestions,
      recommendation: {
        certainty: allScripts.confidence === "high" ? "likely" : "uncertain",
        method: bestGuess,
        explanation: this.explainChoice(bestGuess, allScripts),
        alternatives: this.getAlternatives(bestGuess, allScripts),
      },
    };
  }

  /**
   * 步骤 1：判断是否动态生成
   */
  private async isDynamicallyGenerated(
    projectPath: string,
    files: string[],
    routerInfo: RouterInfo
  ): Promise<boolean> {
    const indicators: boolean[] = [];

    // 指标 1：存在路由生成脚本
    indicators.push(await this.hasGenerationScript(files));

    // 指标 2：package.json 有生成命令
    indicators.push(await this.hasGenerationCommand(projectPath));

    // 指标 3：文档提到路由生成
    indicators.push(await this.documentationMentionsGeneration(projectPath));

    // 指标 4：路由文件有统一模式（可能是生成的）
    indicators.push(this.hasUniformPattern(routerInfo));

    // 至少 2 个指标为 true 才认为是动态生成
    return indicators.filter(Boolean).length >= 2;
  }

  private async hasGenerationScript(files: string[]): Promise<boolean> {
    return files.some(
      (f) =>
        (f.includes("generate") ||
          f.includes("build") ||
          f.includes("create")) &&
        (f.includes("route") || f.includes("page")) &&
        /\.(js|ts|py|sh)$/.test(f)
    );
  }

  private async hasGenerationCommand(projectPath: string): Promise<boolean> {
    const packageJsonPath = path.join(projectPath, "package.json");
    if (await FileUtils.fileExists(packageJsonPath)) {
      const content = await FileUtils.readFile(packageJsonPath);
      const pkg = JSON.parse(content);
      if (pkg.scripts) {
        return Object.keys(pkg.scripts).some(
          (key) =>
            (key.includes("generate") || key.includes("build")) &&
            (key.includes("route") || key.includes("page"))
        );
      }
    }
    return false;
  }

  private async documentationMentionsGeneration(
    projectPath: string
  ): Promise<boolean> {
    const readmePath = path.join(projectPath, "README.md");
    if (await FileUtils.fileExists(readmePath)) {
      const content = await FileUtils.readFile(readmePath);
      return (
        content.toLowerCase().includes("generate") &&
        (content.toLowerCase().includes("route") ||
          content.toLowerCase().includes("路由"))
      );
    }
    return false;
  }

  private hasUniformPattern(routerInfo: RouterInfo): boolean {
    // 如果路由文件都遵循严格的模式，可能是生成的
    // 这是一个启发式判断，不太可靠
    return false; // 保守判断
  }

  /**
   * 步骤 3：检查文档说明
   */
  private async checkDocumentation(projectPath: string): Promise<{
    found: boolean;
    file?: string;
    section?: string;
    method?: string;
  }> {
    const docFiles = [
      "README.md",
      "README.zh-CN.md",
      "DEVELOPMENT.md",
      "CONTRIBUTING.md",
      "docs/routing.md",
      "docs/development.md",
    ];

    for (const docFile of docFiles) {
      const docPath = path.join(projectPath, docFile);
      if (await FileUtils.fileExists(docPath)) {
        const content = await FileUtils.readFile(docPath);

        // 查找路由相关章节
        const routeSection = this.extractRouteSection(content);
        if (routeSection) {
          // 提取生成方法
          const method = this.extractGenerationMethod(routeSection);

          if (method) {
            return {
              found: true,
              file: docFile,
              section: routeSection.slice(0, 500), // 截取前 500 字符
              method,
            };
          }
        }
      }
    }

    return { found: false };
  }

  /**
   * 提取路由相关章节
   */
  private extractRouteSection(content: string): string | null {
    const lines = content.split("\n");
    let inRouteSection = false;
    let section = "";
    let headerLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测章节开始
      const headerMatch = line.match(
        /^(#{1,4})\s+(.*路由.*|.*Route.*|.*Routing.*)/i
      );
      if (headerMatch) {
        inRouteSection = true;
        headerLevel = headerMatch[1].length;
        section = line + "\n";
        continue;
      }

      // 检测章节结束（同级或更高级标题）
      if (inRouteSection) {
        const nextHeaderMatch = line.match(/^(#{1,4})\s+/);
        if (nextHeaderMatch && nextHeaderMatch[1].length <= headerLevel) {
          break;
        }
        section += line + "\n";
      }
    }

    return section.trim() || null;
  }

  /**
   * 提取生成方法
   */
  private extractGenerationMethod(section: string): string | null {
    // 查找代码块中的命令
    const codeBlockMatches = section.matchAll(
      /```(?:bash|sh)?\n([\s\S]*?)```/g
    );

    for (const match of codeBlockMatches) {
      const codeBlock = match[1];

      // 查找命令行
      const commandMatches = codeBlock.matchAll(
        /(?:npm run|yarn|pnpm|python|node)\s+[\w:.-]+/g
      );
      for (const cmdMatch of commandMatches) {
        const command = cmdMatch[0];
        if (
          command.includes("route") ||
          command.includes("generate") ||
          command.includes("page")
        ) {
          return command;
        }
      }
    }

    return null;
  }

  /**
   * 步骤 5：查找生成脚本（已有，增强版本）
   */
  private async findGenerationScripts(
    projectPath: string,
    files: string[]
  ): Promise<{
    scripts: string[];
    confidence: "high" | "medium" | "low";
  }> {
    const possibleScripts = files
      .filter(
        (f) =>
          (f.includes("generate") ||
            f.includes("build") ||
            f.includes("create")) &&
          (f.includes("route") || f.includes("page")) &&
          /\.(js|ts|py|sh)$/.test(f) &&
          !f.includes("node_modules")
      )
      .map((f) => FileUtils.getRelativePath(projectPath, f));

    let confidence: "high" | "medium" | "low" = "low";

    if (possibleScripts.length === 1) {
      confidence = "high";
    } else if (possibleScripts.length > 1 && possibleScripts.length <= 3) {
      confidence = "medium";
    }

    return { scripts: possibleScripts, confidence };
  }

  /**
   * 查找 package.json 中的生成命令
   */
  private async findGenerationCommands(projectPath: string): Promise<{
    commands: string[];
    confidence: "high" | "medium" | "low";
  }> {
    const packageJsonPath = path.join(projectPath, "package.json");
    const commands: string[] = [];

    if (await FileUtils.fileExists(packageJsonPath)) {
      const content = await FileUtils.readFile(packageJsonPath);
      const pkg = JSON.parse(content);

      if (pkg.scripts) {
        for (const [key, value] of Object.entries(pkg.scripts)) {
          if (
            (key.includes("generate") ||
              key.includes("build") ||
              key.includes("create")) &&
            (key.includes("route") || key.includes("page"))
          ) {
            commands.push(`npm run ${key}`);
          }
        }
      }
    }

    let confidence: "high" | "medium" | "low" = "low";
    if (commands.length === 1) {
      confidence = "high";
    } else if (commands.length > 1 && commands.length <= 3) {
      confidence = "medium";
    }

    return { commands, confidence };
  }

  /**
   * 评估总体置信度
   */
  private evaluateOverallConfidence(
    scriptsAnalysis: { scripts: string[]; confidence: "high" | "medium" | "low" },
    commandsAnalysis: { commands: string[]; confidence: "high" | "medium" | "low" }
  ): "high" | "medium" | "low" {
    // 如果命令和脚本都只有一个，且一致
    if (
      scriptsAnalysis.scripts.length === 1 &&
      commandsAnalysis.commands.length === 1
    ) {
      return "high";
    }

    // 如果命令明确（只有一个）
    if (commandsAnalysis.commands.length === 1) {
      return "high";
    }

    // 如果有多个选项
    if (
      scriptsAnalysis.scripts.length > 1 ||
      commandsAnalysis.commands.length > 1
    ) {
      return "medium";
    }

    return "low";
  }

  /**
   * 步骤 6：生成确认问题
   */
  private generateConfirmationQuestions(
    scripts: { files: string[]; commands: string[]; confidence: "high" | "medium" | "low" },
    documentation: DynamicRoutingAnalysis["documentation"]
  ): ConfirmationQuestion[] {
    const questions: ConfirmationQuestion[] = [];

    if (scripts.commands.length > 1 || scripts.files.length > 1) {
      const allOptions = [
        ...scripts.commands,
        ...scripts.files.map((f: string) => `使用脚本: @${f}`),
        "项目不使用脚本生成路由",
      ];

      questions.push({
        id: "route-generation-method",
        question: "项目使用哪种方式生成路由？",
        context: `检测到多个可能的选项`,
        options: allOptions,
        suggestedAnswer: scripts.commands[0] || scripts.files[0],
        reason: "基于命令名称或文件名称",
        relatedFiles: [...scripts.files],
        impact: "这将决定路由规则中的新建路由指南",
      });
    }

    return questions;
  }

  /**
   * 解释选择理由
   */
  private explainChoice(choice: string, scripts: { files: string[]; commands: string[] }): string {
    if (scripts.commands.includes(choice)) {
      return `选择此命令因为：在 package.json 中找到，命令名称包含 'generate' 和 'route'`;
    }
    if (scripts.files.includes(choice)) {
      return `选择此脚本因为：文件名包含 'generate' 和 'route'`;
    }
    return "基于启发式分析";
  }

  /**
   * 获取备选方案
   */
  private getAlternatives(current: string, scripts: { files: string[]; commands: string[] }): string[] {
    const all = [...scripts.commands, ...scripts.files];
    return all.filter((item) => item !== current);
  }

  /**
   * 获取默认模式
   */
  private getDefaultPattern(): RoutingPattern {
    return {
      organization: "distributed",
      urlNaming: "kebab-case",
      fileNaming: "unknown",
      dynamicRoutePattern: "none",
      dynamicRouteExamples: [],
      hasRouteGroups: false,
      supportsLayouts: false,
      hasGuards: false,
      usesLazyLoading: false,
      hasRouteMeta: false,
      isDynamicGenerated: false,
    };
  }
}

/**
 * 动态路由分析结果
 */
export interface DynamicRoutingAnalysis {
  isDynamic: boolean;
  confidence: "certain" | "likely" | "uncertain";

  documentation: {
    found: boolean;
    file?: string;
    section?: string;
    method?: string;
  };

  scripts: {
    files: string[];
    commands: string[];
    confidence: "high" | "medium" | "low";
  };

  needsConfirmation: boolean;
  confirmationQuestions: ConfirmationQuestion[];

  recommendation: {
    certainty: "certain" | "likely" | "uncertain";
    method: string;
    explanation: string;
    source?: string;
    alternatives?: string[];
  };
}

export interface ConfirmationQuestion {
  id: string;
  question: string;
  context: string;
  options: string[];
  suggestedAnswer: string;
  reason: string;
  relatedFiles: string[];
  impact: string;
}
