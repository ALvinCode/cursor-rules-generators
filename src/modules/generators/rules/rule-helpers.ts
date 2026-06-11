/**
 * 规则生成共享纯函数
 *
 * 这些函数仅依赖传入的 `RuleGenerationContext`（或基本类型），不依赖任何生成器实例状态，
 * 供多个规则生成器共享。集中到此处避免逻辑在各生成器间重复或漂移。
 */

import * as path from "path";

import { RuleGenerationContext } from "../../../types.js";
import type { ExtractedBestPractice } from "../best-practice-extractor.js";
import { aggregatePlatformRuleSections } from "../../platforms/registry.js";

/**
 * 判断某项特征是否在项目中存在（先看代码特征，再看依赖）。
 */
export function featureExists(
  context: RuleGenerationContext,
  featureName: string
): boolean {
  if (context.codeFeatures[featureName]) {
    return context.codeFeatures[featureName].frequency > 0;
  }

  const featureDeps: Record<string, string[]> = {
    testing: ["jest", "vitest", "mocha", "@testing-library"],
    "state-management": ["redux", "zustand", "mobx", "pinia", "vuex", "nanostores"],
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
 * 是否存在自定义工具（hooks / utils / apiClient）。被 generate 编排与 global 规则共用。
 */
export function hasCustomTools(context: RuleGenerationContext): boolean {
  if (!context.customPatterns) return false;
  return (
    context.customPatterns.customHooks.length > 0 ||
    context.customPatterns.customUtils.length > 0 ||
    Boolean(context.customPatterns.apiClient?.exists)
  );
}

/**
 * 是否在项目实际代码中检测到错误处理实践。
 */
export function hasErrorHandling(context: RuleGenerationContext): boolean {
  const errorHandling = context.projectPractice?.errorHandling;
  if (!errorHandling) return false;
  return errorHandling.frequency > 0;
}

/**
 * 是否使用状态管理（基于依赖/特征）。
 */
export function hasStateManagement(context: RuleGenerationContext): boolean {
  return featureExists(context, "state-management");
}

/**
 * 项目主语言是否包含 JavaScript 或 TypeScript。
 * 用于门控 JS/TS 专属的约束和示例（如 `NEVER use any`、TS Do/Don't 代码块），
 * 避免非 JS/TS 项目拿到无关内容。
 */
export function isJsTsProject(context: RuleGenerationContext): boolean {
  const langs = context.techStack.languages;
  return langs.includes("TypeScript") || langs.includes("JavaScript");
}

/**
 * 是否存在 UI 信号，用于决定是否生成 ui-ux 规则。
 *
 * 唯一判据：项目内真实使用的 UI 类依赖（基于代码扫描裁定，非仅安装）。
 * 不以组件目录作为判据 —— 组件可能是业务组件而非 UI 组件，存在性不代表使用了 UI 库。
 */
export function hasUISignal(context: RuleGenerationContext): boolean {
  return (context.uiLibraries?.active ?? []).length > 0;
}

/**
 * 是否为前端项目（基于已识别的前端框架）。
 */
export function isFrontendProject(context: RuleGenerationContext): boolean {
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
 * 根据项目语言推导通用 globs（如 `**\/*.{ts,tsx,js,jsx}`）。
 */
export function getLanguageGlobs(context: RuleGenerationContext): string {
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
  // 单文件组件类框架的专属扩展名（基于检测到的框架补充）
  if (context.techStack.frameworks.includes("Astro")) exts.push("astro");
  if (exts.length === 0) exts.push("ts", "tsx", "js", "jsx");
  return `**/*.{${exts.join(",")}}`;
}

/**
 * 根据路由信息推导路由相关 globs；无法识别时回退到约定路径。
 */
export function getRouteGlobs(
  router: { info?: { location?: string[] } } | undefined,
  type: "frontend" | "backend"
): string {
  const locations = [...new Set(
    (router?.info?.location ?? []).filter((loc) => !path.isAbsolute(loc))
  )];
  if (locations.length > 0) {
    return locations.map((loc) => `${loc}**`).join(", ");
  }
  return type === "frontend"
    ? "**/routes/**, **/pages/**, **/app/**"
    : "**/routes/**, **/api/**, **/controllers/**";
}

/**
 * 生成带版本号的技术栈描述块。仅输出有值的字段。
 */
/**
 * 从依赖列表中查找与技术名称精确匹配的版本号（不区分大小写）。
 * 只做精确匹配，避免子串匹配导致 @sentry/react 或 vue-router 误命中。
 */
function findDepVersion(
  tech: string,
  deps: Array<{ name: string; version: string }>
): string | undefined {
  const techLower = tech.toLowerCase();
  return deps.find((d) => d.name.toLowerCase() === techLower)?.version;
}

export function generateVersionedTechStack(
  context: RuleGenerationContext
): string {
  const lines: string[] = [];
  const deps = context.techStack.dependencies || [];

  const primaryWithVersions = context.techStack.primary.map((tech) => {
    const ver = findDepVersion(tech, deps);
    return ver ? `${tech} ${ver}` : tech;
  });

  if (primaryWithVersions.length > 0) {
    lines.push(`**Primary**: ${primaryWithVersions.join(", ")}`);
  }
  if (context.techStack.languages.length > 0) {
    lines.push(`**Languages**: ${context.techStack.languages.join(", ")}`);
  }
  if (context.techStack.packageManagers.length > 0) {
    lines.push(
      `**Package Manager**: ${context.techStack.packageManagers.join(", ")}`
    );
  }
  if (context.techStack.frameworks.length > 0) {
    const fwWithVersions = context.techStack.frameworks.map((fw) => {
      const ver = findDepVersion(fw, deps);
      return ver ? `${fw} ${ver}` : fw;
    });
    lines.push(`**Frameworks**: ${fwWithVersions.join(", ")}`);
  }

  // Key Libraries：从依赖中提取 UI 库、状态管理等非 primary/framework 的关键依赖
  // build-tool 仅保留主构建工具本体（vite/webpack/rollup），排除 devDep 的插件
  const runtimeCategories = ["ui-library", "state-management", "css-framework"];
  const buildToolBodies = new Set(["vite", "webpack", "rollup", "esbuild", "parcel", "turbopack"]);
  const primaryLower = new Set(context.techStack.primary.map((p) => p.toLowerCase()));
  const fwLower = new Set(context.techStack.frameworks.map((f) => f.toLowerCase()));
  const keyLibs = deps
    .filter((d) => {
      const cat = d.category ?? "";
      const nameLower = d.name.toLowerCase();
      if (primaryLower.has(nameLower) || fwLower.has(nameLower)) return false;
      if (runtimeCategories.includes(cat)) return true;
      if (cat === "build-tool" && buildToolBodies.has(nameLower) && d.type === "devDependency") return true;
      return false;
    })
    .map((d) => d.version ? `${d.name} ${d.version}` : d.name);
  // 补充 UI 库（可能通过 uiLibraries 管线检测到），跳过已在列表中的（含别名）
  const uiAliases: Record<string, string[]> = {
    "ant design": ["antd", "@ant-design"],
    "element plus": ["element-plus"],
    "element ui": ["element-ui"],
    "material ui": ["@mui"],
    "chakra ui": ["@chakra-ui"],
  };
  if (context.uiLibraries?.active) {
    for (const lib of context.uiLibraries.active) {
      const libLower = lib.name.toLowerCase();
      const aliases = uiAliases[libLower] ?? [];
      const already = keyLibs.some((k) => {
        const kLower = k.toLowerCase();
        return kLower.startsWith(libLower) || aliases.some((a) => kLower.startsWith(a));
      });
      if (!already) {
        const ver = findDepVersion(lib.name, deps);
        keyLibs.push(ver ? `${lib.name} ${ver}` : lib.name);
      }
    }
  }
  if (keyLibs.length > 0) {
    lines.push(`**Key Libraries**: ${keyLibs.join(", ")}`);
  }

  return lines.join("  \n");
}

/**
 * 生成 Commands 章节（仅在存在命令时输出）。
 */
export function generateCommandsSection(
  context: RuleGenerationContext
): string {
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
  if (cmds.typeCheck) entries.push(`| Type Check | \`${cmds.typeCheck}\` |`);

  if (entries.length === 0) return "";

  return `\n## Commands\n\n| Task | Command |\n|------|---------|
${entries.join("\n")}\n`;
}

/**
 * 生成 persona 句（技术栈为空时退化为通用描述，避免 "expert in Unknown"）。
 */
export function generatePersona(context: RuleGenerationContext): string {
  const allTech = [
    ...context.techStack.primary,
    ...context.techStack.frameworks.filter(
      (f) => !context.techStack.primary.includes(f)
    ),
  ];

  const isFrontend = isFrontendProject(context);
  const backendIndicators = [
    "express",
    "fastify",
    "koa",
    "nestjs",
    "django",
    "flask",
    "spring",
  ];
  const isBackend = [
    ...context.techStack.primary,
    ...context.techStack.frameworks,
  ].some((tech) => backendIndicators.some((b) => tech.toLowerCase().includes(b)));

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

  const techForPersona =
    allTech.length > 0 ? allTech : context.techStack.languages;
  if (techForPersona.length === 0) {
    return `You are an expert software engineer with deep knowledge of ${role} best practices.`;
  }
  return `You are an expert in ${techForPersona.join(
    ", "
  )} with deep knowledge of ${role} best practices.`;
}

/**
 * 生成「写完代码后必须运行的命令」约束句（无命令时返回空串）。
 */
export function generatePostCodingConstraint(
  context: RuleGenerationContext
): string {
  const cmds = context.projectConfig?.commands;
  const parts: string[] = [];
  if (cmds?.lint || cmds?.lintFix) parts.push(`\`${cmds.lintFix ?? cmds.lint}\``);
  if (cmds?.typeCheck) parts.push(`\`${cmds.typeCheck}\``);
  if (parts.length === 0) return "";
  return `- After writing code, run ${parts.join(
    " and "
  )} before considering the task complete.`;
}

/**
 * 从项目路径取项目名。
 */
export function getProjectName(projectPath: string): string {
  return path.basename(projectPath);
}

/**
 * 将任意名称规整为合法的 kebab-case 文件名片段。
 */
export function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * 路由类型的中文描述。
 */
export function getRouterTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    "file-based": "File-based routing (convention-based)",
    "config-based": "Config-based routing (declarative)",
    programmatic: "Programmatic routing (code-defined)",
    mixed: "Mixed mode",
  };
  return descriptions[type] || type;
}

/**
 * 组织方式的中文描述。
 */
export function getOrganizationDescription(org: string): string {
  const descriptions: Record<string, string> = {
    centralized: "Centralized",
    distributed: "Distributed",
    "feature-based": "Feature-based organization",
    mixed: "Mixed approach",
  };
  return descriptions[org] || org;
}

/**
 * 架构模式类型的展示名。
 */
export function getArchitecturePatternName(type: string): string {
  const names: Record<string, string> = {
    mvc: "MVC",
    "clean-architecture": "Clean Architecture",
    "feature-based": "Feature-based",
    "domain-driven": "Domain-driven Design",
    layered: "Layered",
    "modular-monolith": "Modular Monolith",
    microservices: "Microservices",
    monorepo: "Monorepo",
    mixed: "Mixed architecture",
    unknown: "Unknown",
  };
  return names[type] || type;
}

/**
 * 模块类型的中文名。
 */
export function getModuleTypeName(type: string): string {
  const names: Record<string, string> = {
    frontend: "Frontend",
    backend: "Backend",
    shared: "Shared",
    service: "Service",
    package: "Package",
    other: "Other",
  };
  return names[type] || type;
}

/**
 * 检测项目使用的测试框架（基于依赖）。被 global-rules 与 testing 规则共享。
 */
export function detectTestFramework(
  context: RuleGenerationContext
): { name: string; version?: string } | null {
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
    const dep = deps.find((d) => d.name === lib.pkg);
    if (dep) return { name: lib.name, version: dep.version };
  }
  return null;
}

/**
 * 将「项目已使用但规则中缺失的最佳实践」格式化为规则内容片段。
 * 被 code-style / architecture / error-handling 规则共享。
 */
export function formatMissingPractices(practices: ExtractedBestPractice[]): string {
  if (!practices || practices.length === 0) {
    return "";
  }

  const sections: string[] = [];
  for (const practice of practices) {
    let section = `### ${practice.title}\n\n`;
    const cleanedContent = practice.content.replace(/\n---\s*$/, "").trimEnd();
    section += `${cleanedContent}\n\n`;

    if (practice.techStack && practice.techStack.length > 0) {
      section += `**Related Tech Stack**: ${practice.techStack.join(", ")}\n`;
    }

    sections.push(section.trimEnd());
  }

  return sections.join("\n\n---\n\n");
}

/**
 * 模块类别的展示名。
 */
export function getCategoryDisplayName(category: string): string {
  const names: Record<string, string> = {
    package: "Package/Library module",
    project: "Project module",
    module: "Feature module",
    component: "Component module",
    service: "Service module",
    api: "API module",
    shared: "Shared module",
    common: "Common module",
    other: "Other directory",
  };
  return names[category] || category;
}

/**
 * 获取平台 adapter 为指定 ruleType 贡献的内容片段。
 * 无平台或无贡献时返回空字符串，调用方可直接拼接。
 */
export function getPlatformSections(
  context: RuleGenerationContext,
  ruleType: string
): string {
  const platforms = context.techStack.platforms;
  if (!platforms || platforms.length === 0) return "";

  const sections = aggregatePlatformRuleSections(platforms);
  return sections.get(ruleType) ?? "";
}
