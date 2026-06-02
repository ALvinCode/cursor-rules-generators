/**
 * 规则生成共享纯函数
 *
 * 这些函数仅依赖传入的 `RuleGenerationContext`（或基本类型），不依赖任何生成器实例状态，
 * 供多个规则生成器共享。集中到此处避免逻辑在各生成器间重复或漂移。
 */

import * as path from "path";

import { RuleGenerationContext } from "../../../types.js";

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
  if (exts.length === 0) exts.push("ts", "tsx", "js", "jsx");
  return `**/*.{${exts.join(",")}}`;
}

/**
 * 根据路由信息推导路由相关 globs；无法识别时回退到约定路径。
 */
export function getRouteGlobs(
  router: any,
  type: "frontend" | "backend"
): string {
  const locations: string[] = (router?.info?.location || []).filter(
    (loc: string) => !path.isAbsolute(loc)
  );
  if (locations.length > 0) {
    return locations.map((loc: string) => `${loc}**`).join(", ");
  }
  return type === "frontend"
    ? "**/routes/**, **/pages/**, **/app/**"
    : "**/routes/**, **/api/**, **/controllers/**";
}

/**
 * 生成带版本号的技术栈描述块。仅输出有值的字段。
 */
export function generateVersionedTechStack(
  context: RuleGenerationContext
): string {
  const lines: string[] = [];
  const deps = context.techStack.dependencies || [];

  const primaryWithVersions = context.techStack.primary.map((tech) => {
    const dep = deps.find(
      (d) =>
        d.name.toLowerCase() === tech.toLowerCase() ||
        d.name.toLowerCase().includes(tech.toLowerCase())
    );
    return dep ? `${tech} ${dep.version}` : tech;
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
      const dep = deps.find(
        (d) =>
          d.name.toLowerCase() === fw.toLowerCase() ||
          d.name.toLowerCase().includes(fw.toLowerCase())
      );
      return dep ? `${fw} ${dep.version}` : fw;
    });
    lines.push(`**Frameworks**: ${fwWithVersions.join(", ")}`);
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
    "file-based": "文件系统路由（约定式）",
    "config-based": "配置式路由（声明式）",
    programmatic: "编程式路由（代码定义）",
    mixed: "混合模式",
  };
  return descriptions[type] || type;
}

/**
 * 组织方式的中文描述。
 */
export function getOrganizationDescription(org: string): string {
  const descriptions: Record<string, string> = {
    centralized: "集中管理",
    distributed: "分散定义",
    "feature-based": "按功能模块组织",
    mixed: "混合方式",
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
    microservices: "微服务",
    monorepo: "Monorepo",
    mixed: "混合架构",
    unknown: "未知",
  };
  return names[type] || type;
}

/**
 * 模块类型的中文名。
 */
export function getModuleTypeName(type: string): string {
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
export function formatMissingPractices(practices: any[]): string {
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
 * 模块类别的展示名。
 */
export function getCategoryDisplayName(category: string): string {
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
