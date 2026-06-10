import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";
import { TechStack, Dependency } from '../../types.js';
import { detectPlatforms } from "../platforms/detector.js";
import { aggregatePlatformCapabilities } from "../platforms/registry.js";

/**
 * 技术栈检测器
 * 分析项目依赖和配置文件，识别使用的技术栈
 */
export class TechStackDetector {
  async detect(projectPath: string, files: string[]): Promise<TechStack> {
    const dependencies: Dependency[] = [];
    const packageManagers: string[] = [];
    const languages = new Set<string>();
    const frameworks = new Set<string>();

    // 检测 Node.js 项目
    const packageJsonPath = path.join(projectPath, "package.json");
    if (await FileUtils.fileExists(packageJsonPath)) {
      const packageData = await this.analyzePackageJson(packageJsonPath);
      dependencies.push(...packageData.dependencies);
      packageManagers.push(...packageData.packageManagers);
      packageData.frameworks.forEach((f) => frameworks.add(f));
      languages.add("JavaScript");
    }

    // 检测 Python 项目
    const requirementsPath = path.join(projectPath, "requirements.txt");
    if (await FileUtils.fileExists(requirementsPath)) {
      const pythonDeps = await this.analyzeRequirementsTxt(requirementsPath);
      dependencies.push(...pythonDeps);
      languages.add("Python");
    }

    const pipfilePath = path.join(projectPath, "Pipfile");
    if (await FileUtils.fileExists(pipfilePath)) {
      languages.add("Python");
      packageManagers.push("pipenv");
    }

    // 检测 Go 项目
    const goModPath = path.join(projectPath, "go.mod");
    if (await FileUtils.fileExists(goModPath)) {
      languages.add("Go");
      packageManagers.push("go modules");
    }

    // 检测 Rust 项目
    const cargoPath = path.join(projectPath, "Cargo.toml");
    if (await FileUtils.fileExists(cargoPath)) {
      languages.add("Rust");
      packageManagers.push("cargo");
    }

    // 检测 Java 项目
    if (
      files.some((f) => f.endsWith("pom.xml") || f.endsWith("build.gradle"))
    ) {
      languages.add("Java");
      if (files.some((f) => f.endsWith("pom.xml"))) {
        packageManagers.push("maven");
      }
      if (files.some((f) => f.endsWith("build.gradle"))) {
        packageManagers.push("gradle");
      }
    }

    // 通过文件扩展名检测语言和框架（框架需依赖验证）
    const depNameSet = new Set(dependencies.map((d) => d.name.toLowerCase()));
    const hasExtension = { vue: false, svelte: false, astro: false };
    for (const file of files) {
      const ext = path.extname(file);
      if (ext === ".ts" || ext === ".tsx") languages.add("TypeScript");
      if (ext === ".vue") hasExtension.vue = true;
      if (ext === ".svelte") hasExtension.svelte = true;
      if (ext === ".astro") hasExtension.astro = true;
    }
    if (hasExtension.vue && depNameSet.has("vue")) frameworks.add("Vue");
    if (hasExtension.svelte && depNameSet.has("svelte")) frameworks.add("Svelte");
    if (hasExtension.astro && depNameSet.has("astro")) frameworks.add("Astro");

    // 平台/生态检测
    const platforms = detectPlatforms({
      projectPath,
      files,
      dependencyNames: dependencies.map((d) => d.name.toLowerCase()),
    });
    // 通电：叠加平台引入的语言（Flutter→Dart、iOS→Swift、Android→Kotlin），
    // 使无 package.json 的原生/跨平台项目也能被识别，不被「空技术栈」拦截。
    const platformCaps = aggregatePlatformCapabilities(platforms);
    platformCaps.languages.forEach((l) => languages.add(l));

    // 确定主要技术栈（在平台语言合并之后）
    const primary = this.determinePrimaryStack(
      Array.from(languages),
      Array.from(frameworks),
      dependencies
    );

    return {
      primary,
      dependencies,
      packageManagers,
      frameworks: Array.from(frameworks),
      languages: Array.from(languages),
      platforms,
    };
  }

  /**
   * 分析 package.json
   */
  private async analyzePackageJson(filePath: string): Promise<{
    dependencies: Dependency[];
    packageManagers: string[];
    frameworks: string[];
  }> {
    const content = await FileUtils.readFile(filePath);
    const data = JSON.parse(content);

    const dependencies: Dependency[] = [];
    const frameworks: string[] = [];

    // 解析依赖
    const deps = data.dependencies || {};
    const devDeps = data.devDependencies || {};
    const peerDeps = data.peerDependencies || {};

    for (const [name, version] of Object.entries(deps)) {
      dependencies.push({
        name,
        version: version as string,
        type: "dependency",
        category: this.categorizeDependency(name),
      });

      // 检测框架
      if (this.isFramework(name)) {
        frameworks.push(this.getFrameworkName(name));
      }
    }

    for (const [name, version] of Object.entries(devDeps)) {
      dependencies.push({
        name,
        version: version as string,
        type: "devDependency",
        category: this.categorizeDependency(name),
      });
    }

    for (const [name, version] of Object.entries(peerDeps)) {
      dependencies.push({
        name,
        version: version as string,
        type: "peerDependency",
        category: this.categorizeDependency(name),
      });
    }

    // 检测包管理器
    const packageManagers: string[] = ["npm"]; // 默认有 npm
    const projectDir = path.dirname(filePath);

    if (await FileUtils.fileExists(path.join(projectDir, "yarn.lock"))) {
      packageManagers.push("yarn");
    }
    if (await FileUtils.fileExists(path.join(projectDir, "pnpm-lock.yaml"))) {
      packageManagers.push("pnpm");
    }

    return { dependencies, packageManagers, frameworks };
  }

  /**
   * 分析 requirements.txt
   */
  private async analyzeRequirementsTxt(
    filePath: string
  ): Promise<Dependency[]> {
    const content = await FileUtils.readFile(filePath);
    const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"));

    return lines.map((line) => {
      const match = line.match(/^([a-zA-Z0-9-_]+)([>=<]+)(.+)$/);
      if (match) {
        return {
          name: match[1],
          version: match[3],
          type: "dependency" as const,
          category: this.categorizeDependency(match[1]),
        };
      }
      return {
        name: line.trim(),
        version: "*",
        type: "dependency" as const,
        category: this.categorizeDependency(line.trim()),
      };
    });
  }

  /**
   * 对依赖进行分类
   */
  private categorizeDependency(name: string): string {
    const frameworks = [
      "react", "vue", "angular", "svelte", "next", "nuxt", "express", "fastify", "nestjs",
      "solid-js", "preact", "@builder.io/qwik", "astro", "gatsby",
      "@remix-run", "@solidjs/start", "@tanstack/react-start",
    ];
    const uiLibs = ["@mui", "antd", "element", "chakra", "tailwind"];
    const stateManagement = ["redux", "mobx", "zustand", "pinia", "vuex"];
    const testing = ["jest", "vitest", "mocha", "chai", "cypress", "playwright"];
    const buildTools = ["webpack", "vite", "rollup", "esbuild", "parcel"];

    if (frameworks.some((f) => name.includes(f))) return "framework";
    if (uiLibs.some((lib) => name.includes(lib))) return "ui-library";
    if (stateManagement.some((sm) => name.includes(sm))) return "state-management";
    if (testing.some((t) => name.includes(t))) return "testing";
    if (buildTools.some((bt) => name.includes(bt))) return "build-tool";

    return "library";
  }

  /**
   * 检查是否是框架
   */
  private isFramework(name: string): boolean {
    const frameworks = [
      "react", "vue", "angular", "svelte", "next", "nuxt", "express", "fastify", "nestjs", "django", "flask", "fastapi",
      // 新增前端 UI 框架与元框架本体（非 scoped）
      "solid-js", "preact", "lit", "alpinejs", "astro", "gatsby",
    ];
    if (frameworks.some((f) => name === f || name.startsWith(`@${f}/`))) {
      return true;
    }
    // scoped 现代框架本体（精确匹配，避免误伤路由/工具子包）
    const scopedFrameworks = [
      "@builder.io/qwik",
      "@builder.io/qwik-city",
      "@solidjs/start",
      "@tanstack/react-start",
      "@tanstack/start",
    ];
    if (scopedFrameworks.includes(name)) return true;
    // Remix 的多个包（@remix-run/react、@remix-run/node 等）均视为 Remix 框架
    if (name.startsWith("@remix-run/")) return true;
    return false;
  }

  /**
   * 获取框架名称
   */
  private getFrameworkName(name: string): string {
    if (name === "react" || name.startsWith("@react")) return "React";
    if (name === "vue" || name.startsWith("@vue")) return "Vue";
    if (name === "next" || name === "nextjs") return "Next.js";
    if (name === "nuxt" || name.startsWith("@nuxt")) return "Nuxt";
    if (name === "express") return "Express";
    if (name === "fastify") return "Fastify";
    if (name === "@nestjs/core") return "NestJS";
    if (name === "angular" || name.startsWith("@angular")) return "Angular";
    if (name === "svelte") return "Svelte";
    // 新增前端框架
    if (name === "solid-js") return "SolidJS";
    if (name === "@solidjs/start") return "SolidStart";
    if (name === "preact") return "Preact";
    if (name === "@builder.io/qwik") return "Qwik";
    if (name === "@builder.io/qwik-city") return "Qwik City";
    if (name === "lit") return "Lit";
    if (name === "alpinejs") return "Alpine.js";
    if (name === "astro") return "Astro";
    if (name === "gatsby") return "Gatsby";
    if (name.startsWith("@remix-run/")) return "Remix";
    if (name === "@tanstack/react-start" || name === "@tanstack/start")
      return "TanStack Start";
    return name;
  }

  /**
   * 确定主要技术栈
   */
  private determinePrimaryStack(
    languages: string[],
    frameworks: string[],
    dependencies: Dependency[]
  ): string[] {
    const primary: string[] = [];

    // 添加主要框架
    primary.push(...frameworks);

    // 添加主要语言
    if (languages.includes("TypeScript")) {
      primary.push("TypeScript");
    } else if (languages.includes("JavaScript")) {
      primary.push("JavaScript");
    }

    if (languages.includes("Python")) {
      primary.push("Python");
    }

    if (languages.includes("Go")) {
      primary.push("Go");
    }

    if (languages.includes("Rust")) {
      primary.push("Rust");
    }

    // 移动端 / 跨平台语言（由平台 adapter 能力叠加而来）
    if (languages.includes("Dart")) {
      primary.push("Dart");
    }
    if (languages.includes("Swift")) {
      primary.push("Swift");
    }
    if (languages.includes("Kotlin")) {
      primary.push("Kotlin");
    }

    // 如果没有识别到框架，检查重要依赖
    if (primary.length === 0) {
      const importantDeps = dependencies
        .filter((d) => d.category === "framework")
        .slice(0, 3);
      primary.push(...importantDeps.map((d) => d.name));
    }

    // 未检测到任何主技术栈时返回空数组，而非 "Unknown" 占位。
    // 空技术栈交由生成入口的护栏统一判定（拒绝生成），避免下游产出无意义的占位规则。
    return primary;
  }
}

