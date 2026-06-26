/**
 * 项目架构规则生成器
 *
 * 基于检测到的架构模式、模块结构与代码特征生成架构指南。
 * 一组自包含函数：入口 generateArchitectureRule + 内部 section helper。
 */

import * as path from "path";

import { ArchitecturePattern, CursorRule, RuleGenerationContext } from "../../../types.js";
import type { ExtractedBestPractice } from "../best-practice-extractor.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import {
  formatMissingPractices,
  getArchitecturePatternName,
  getModuleTypeName,
  getCategoryDisplayName,
  getPlatformSections,
} from "./rule-helpers.js";

export function generateArchitectureRule(
  context: RuleGenerationContext,
  missingPractices?: ExtractedBestPractice[]
): CursorRule {
    // architecture 规则通过 description 关键词触发（designing features / adding modules），
    // 不设 globs，避免与 code-style 在每个源码文件上重复触发
    const metadata = buildRuleMetadata(
      "Project Architecture",
      "Consult when designing features, adding modules, or making architectural decisions",
      90,
      context.techStack.primary,
      ["architecture", "modules"],
      "guideline",
      ["global-rules", "project-structure"]
    );

    const architecturePractices =
      missingPractices?.filter((p) => p.category === "architecture") || [];
    const additionalPractices = formatMissingPractices(architecturePractices);
    const codeFeaturesSection = generateCodeFeaturesSection(context);
    const platformArch = getPlatformSections(context, "architecture");
    const principles = generateArchitecturePrinciples(context);
    const canonicalSection = generateCanonicalReferencesSection(context);

    // Value gate: only generate a standalone file when there's concrete
    // architectural detail beyond what global-rules & project-structure cover.
    const pattern = context.architecturePattern;
    const hasConcreteStructure = !!(pattern?.layerStructure || pattern?.featureStructure);
    const meaningfulDirCategories = new Set(
      (context.deepAnalysis ?? [])
        .filter((d) => d.category && d.category !== "other")
        .map((d) => d.category)
    );
    const hasRichDirectoryStructure = meaningfulDirCategories.size >= 3;
    const hasSubstantialContent =
      hasConcreteStructure ||
      !!additionalPractices ||
      !!platformArch ||
      (context.modules.length > 1) ||
      hasRichDirectoryStructure;

    if (!hasSubstantialContent) {
      return {
        scope: "specialized",
        modulePath: context.projectPath,
        content: "",
        fileName: "architecture.mdc",
        priority: 90,
        type: "guideline",
        depends: ["global-rules", "project-structure"],
      };
    }

    const patternBoundary = generatePatternBoundarySection(context);

    const content =
      metadata +
      `
# Project Architecture

See also: @global-rules.mdc, @project-structure.mdc

## Architecture Pattern

${generateArchitecturePatternSection(pattern)}

## Module Structure

${generateModuleStructureSection(context)}
${canonicalSection}${codeFeaturesSection}${generateContextSection(context)}${patternBoundary}${principles ? `## Design Principles\n\n${principles}` : ""}${additionalPractices ? `## Additional Best Practices\n\n${additionalPractices}\n` : ""}${platformArch ? `\n${platformArch}\n` : ""}
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

function generateCodeFeaturesSection(context: RuleGenerationContext): string {
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

function generateArchitecturePatternSection(pattern: ArchitecturePattern | undefined): string {
    if (!pattern || pattern.type === "unknown") {
      return "Project architecture: standard layout (inferred from directory structure)\n\n";
    }

    let content = `This project uses **${getArchitecturePatternName(pattern.type)}** architecture.\n\n`;

    // 注意：置信度（confidence）和识别依据（indicators）是生成器内部分析元数据，
    // 不应出现在规则内容中 — 规则只输出对 AI Agent 有指导意义的约束。

    if (pattern.layerStructure) {
      content += `### Layer Structure\n\n`;
      if (pattern.layerStructure.presentation) {
        content += `- **Presentation layer**: ${pattern.layerStructure.presentation.map((p: string) => `\`${p}\``).join(", ")}\n`;
      }
      if (pattern.layerStructure.application) {
        content += `- **Application layer**: ${pattern.layerStructure.application.map((a: string) => `\`${a}\``).join(", ")}\n`;
      }
      if (pattern.layerStructure.domain) {
        content += `- **Domain layer**: ${pattern.layerStructure.domain.map((d: string) => `\`${d}\``).join(", ")}\n`;
      }
      if (pattern.layerStructure.infrastructure) {
        content += `- **Infrastructure layer**: ${pattern.layerStructure.infrastructure.map((i: string) => `\`${i}\``).join(", ")}\n`;
      }
      content += `\n`;
    }
    
    if (pattern.featureStructure) {
      content += `### Feature Structure\n\n`;
      content += `- **Feature modules**: ${pattern.featureStructure.features.map((f: string) => `\`${f}\``).join(", ")}\n`;
      if (pattern.featureStructure.shared) {
        content += `- **Shared modules**: ${pattern.featureStructure.shared.map((s: string) => `\`${s}\``).join(", ")}\n`;
      }
      content += `\n`;
    }
    
    return content;
}

/**
 * 生成模块结构章节（基于 deepAnalysis 和 project-structure.mdc 的树形结构）
 */
function generateModuleStructureSection(context: RuleGenerationContext): string {
    // 优先使用 deepAnalysis 来生成模块结构摘要
    if (context.deepAnalysis && context.deepAnalysis.length > 0) {
      return generateModuleStructureFromDeepAnalysis(context);
    }

    // 降级：使用 modules 信息
    if (context.modules.length <= 1) {
      return "This is a monolithic application with no clear module boundaries.\n";
    }

    const modulesByType = new Map<string, any[]>();
    for (const module of context.modules) {
      if (!modulesByType.has(module.type)) {
        modulesByType.set(module.type, []);
      }
      modulesByType.get(module.type)!.push(module);
    }

    let content = `The project contains **${context.modules.length}** modules:\n\n`;

    for (const [type, modules] of modulesByType) {
      content += `### ${getModuleTypeName(type)} Modules\n\n`;
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
function generateModuleStructureFromDeepAnalysis(
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

    // 只输出有约束意义的顶层目录摘要，详细结构由 project-structure.mdc 提供
    const categoryOrder = ["component", "service", "api", "shared"];
    const meaningfulDirs: string[] = [];

    for (const category of categoryOrder) {
      if (!dirsByCategory.has(category)) continue;
      const dirs = dirsByCategory.get(category)!;
      const categoryName = getCategoryDisplayName(category);
      for (const dir of dirs) {
        meaningfulDirs.push(`- **\`${path.basename(dir.path)}/\`** — ${categoryName}: ${dir.purpose}`);
      }
    }

    let content = "";
    if (meaningfulDirs.length > 0) {
      content += meaningfulDirs.join("\n") + "\n\n";
    }
    content += `> See also @project-structure.mdc for detailed directory layout and responsibilities\n\n`;

    return content;
}

/**
 * 生成架构设计原则
 */
/**
 * 仅在项目有明确架构类型时输出对应原则，不输出泛化的"模块化、可维护性"等通用常识。
 */
function generateArchitecturePrinciples(context: RuleGenerationContext): string {
    if (!context.architecturePattern || context.architecturePattern.type === "unknown") {
      return "";
    }

    const pattern = context.architecturePattern;
    if (pattern.type === "clean-architecture") {
      return `### Clean Architecture Principles\n\n` +
        `- Dependency direction: outer layers depend on inner layers; inner layers do not depend on outer layers\n` +
        `- Business logic lives in the domain layer and does not depend on frameworks or external services\n` +
        `- Interfaces are defined in the application layer and implemented in the infrastructure layer\n\n`;
    }
    if (pattern.type === "feature-based") {
      return `### Feature-based Principles\n\n` +
        `- Organize code by feature, not by technical type\n` +
        `- Each feature module contains complete business logic\n` +
        `- Place shared code in shared or common directories\n\n`;
    }
    if (pattern.type === "layered") {
      return `### Layered Architecture Principles\n\n` +
        `- Call strictly by layer: upper layers call lower layers; no reverse dependencies\n` +
        `- Controller → Service → Repository; do not skip layers\n\n`;
    }

    return "";
}

/**
 * Detect React Context directories and output a state management note.
 * This covers projects that use Context + useContext instead of redux/mobx/zustand.
 */
function generateContextSection(context: RuleGenerationContext): string {
    const contextDirs = (context.deepAnalysis ?? []).filter(
      (d) => path.basename(d.path).toLowerCase() === "context"
    );
    if (contextDirs.length === 0) return "";

    const hasExternalStateLib = context.techStack.dependencies.some((d) =>
      ["redux", "mobx", "zustand", "pinia", "vuex"].some((lib) =>
        d.name.toLowerCase().includes(lib)
      )
    );

    const dirPaths = contextDirs.map((d) => `\`${d.path}/\``).join(", ");
    let section = `\n## React Context Usage\n\n` +
      `This project uses **React Context** (${dirPaths}).\n`;

    if (hasExternalStateLib) {
      section += `- The project uses both an external state library and React Context — choose per use case\n`;
      section += `- Use Context for UI-scoped state (theme, locale, auth); use the state library for complex business state\n`;
    } else {
      section += `- Use existing Context providers — do not introduce external state management libraries without discussion\n`;
    }
    section += `- Keep Context values focused; split into multiple Contexts if unrelated concerns are grouped\n\n`;
    return section;
}

interface CanonicalReference {
  name: string;
  path: string;
  coverage: Set<string>;
}

function generateCanonicalReferencesSection(context: RuleGenerationContext): string {
    const inDirRefs = findCanonicalReferences(context);
    const crossDirRefs = findCrossDirectoryCanonicalReferences(context);

    const seenNames = new Set(inDirRefs.map((r) => r.name.toLowerCase()));
    const merged = [
      ...inDirRefs,
      ...crossDirRefs.filter((r) => !seenNames.has(r.name.toLowerCase())),
    ];
    merged.sort((a, b) => b.coverage.size - a.coverage.size);
    const topRefs = merged.slice(0, 3);

    if (topRefs.length === 0) return "";

    let section = `\n## Canonical References\n\n`;
    section += `When adding a new feature, use these well-structured modules as references:\n\n`;
    section += `| Reference | Path | What to imitate |\n`;
    section += `|-----------|------|-----------------|\n`;

    for (const ref of topRefs) {
      const imitate = describeCanonicalCoverage(ref.coverage);
      section += `| ${ref.name} | \`${ref.path}\` | ${imitate} |\n`;
    }
    section += `\n`;
    return section;
}

function describeCanonicalCoverage(coverage: Set<string>): string {
    const labels: string[] = [];
    if (coverage.has("component")) labels.push("components");
    if (coverage.has("store")) labels.push("store");
    if (coverage.has("hook")) labels.push("hooks");
    if (coverage.has("type")) labels.push("types");
    if (coverage.has("api")) labels.push("API");
    if (coverage.has("style")) labels.push("styles");
    if (coverage.has("module")) labels.push("supporting modules");
    if (coverage.has("test")) labels.push("tests");

    if (labels.length === 0) return "Complete feature structure";
    return `Feature structure with ${labels.join(", ")}`;
}

function findCanonicalReferences(context: RuleGenerationContext): CanonicalReference[] {
    const PAGE_DIR_KW = new Set(["views", "pages", "screens"]);
    const deepAnalysis = context.deepAnalysis ?? [];
    const files = context.files ?? [];
    const projectPath = context.projectPath;

    const candidates = deepAnalysis.filter((d) => {
      if (d.depth < 2) return false;
      const parentName = d.path.split("/").slice(-2, -1)[0]?.toLowerCase() ?? "";
      if (!PAGE_DIR_KW.has(parentName)) return false;
      const dirName = d.path.split("/").pop() ?? "";
      return /^[a-zA-Z]/.test(dirName);
    });

    const scored: CanonicalReference[] = [];

    for (const dir of candidates) {
      const dirPath = dir.path;
      const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
      const coverage = new Set<string>();

      for (const file of files) {
        const rel = path.relative(projectPath, file).replace(/\\/g, "/");
        if (!rel.startsWith(prefix)) continue;

        const base = path.basename(file);
        const ext = path.extname(file).toLowerCase();

        if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(base)) {
          coverage.add("test");
        } else if (/\.(tsx|jsx|vue)$/.test(ext)) {
          coverage.add("component");
        } else if (/\/store\//i.test(rel) || /Store\.(ts|js)$/.test(base)) {
          coverage.add("store");
        } else if (/\/hooks?\//i.test(rel) || /^use[A-Z]/.test(base)) {
          coverage.add("hook");
        } else if (
          /\/(types?|interfaces?)\//i.test(rel) ||
          /\.types?\.(ts|js)$/.test(base)
        ) {
          coverage.add("type");
        } else if (/\/api\//i.test(rel) && /\.(ts|js)$/.test(ext)) {
          coverage.add("api");
        } else if (/\.(css|scss|less|styl|sass|module\.styl)$/.test(base)) {
          coverage.add("style");
        } else if (/\.(ts|js)$/.test(ext)) {
          coverage.add("module");
        }
      }

      if (coverage.size >= 3) {
        const name = path.basename(dirPath)
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .replace(/\s/g, "");
        scored.push({ name, path: dirPath, coverage });
      }
    }

    scored.sort((a, b) => b.coverage.size - a.coverage.size);
    return scored.slice(0, 2);
}

/**
 * Cross-directory canonical reference detection.
 * For flat-structure projects where a feature's files are spread across
 * api/, store/, hooks/, types/, views/ etc., we find business entity names
 * that appear in 3+ of these functional directories.
 */
function findCrossDirectoryCanonicalReferences(context: RuleGenerationContext): CanonicalReference[] {
    const files = context.files ?? [];
    const projectPath = context.projectPath;
    const org = context.fileOrganization;
    if (!org) return [];

    const locationSets: Array<{ category: string; dirs: string[] }> = [
      { category: "api", dirs: org.apiLocation ?? [] },
      { category: "hook", dirs: org.hooksLocation ?? [] },
      { category: "type", dirs: org.typesLocation ?? [] },
      { category: "component", dirs: org.componentLocation ?? [] },
    ];

    const storeDirs = (context.deepAnalysis ?? [])
      .filter((d) => /^stores?$/i.test(path.basename(d.path)))
      .map((d) => d.path);
    if (storeDirs.length > 0) {
      locationSets.push({ category: "store", dirs: storeDirs });
    }

    const entityMap = new Map<string, { coverage: Set<string>; paths: string[] }>();

    for (const { category, dirs } of locationSets) {
      for (const dir of dirs) {
        const prefix = dir.endsWith("/") ? dir : `${dir}/`;
        for (const file of files) {
          const rel = path.relative(projectPath, file).replace(/\\/g, "/");
          if (!rel.startsWith(prefix)) continue;
          const rest = rel.slice(prefix.length);
          if (rest.includes("/")) continue;

          const baseName = path.basename(file, path.extname(file))
            .replace(/\.(test|spec|types?|api|service|store|slice)$/i, "")
            .replace(/^use/i, "")
            .replace(/Store$/i, "")
            .replace(/Slice$/i, "");

          const normalized = baseName.replace(/[-_]/g, "").toLowerCase();
          if (!normalized || normalized === "index" || normalized === "base") continue;

          if (!entityMap.has(normalized)) {
            entityMap.set(normalized, { coverage: new Set(), paths: [] });
          }
          const entry = entityMap.get(normalized)!;
          entry.coverage.add(category);
          const dirPath = path.dirname(rel);
          if (!entry.paths.includes(dirPath)) {
            entry.paths.push(dirPath);
          }
        }
      }
    }

    const results: CanonicalReference[] = [];
    for (const [normalized, entry] of entityMap) {
      if (entry.coverage.size >= 3) {
        const displayName = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        results.push({
          name: displayName,
          path: entry.paths.join(", "),
          coverage: entry.coverage,
        });
      }
    }

    results.sort((a, b) => b.coverage.size - a.coverage.size);
    return results.slice(0, 3);
}

interface PatternBoundary {
  area: string;
  legacy: string;
  modern: string;
  guidance: string;
}

function generatePatternBoundarySection(context: RuleGenerationContext): string {
    const boundaries: PatternBoundary[] = [];

    const compType = context.projectPractice?.componentPattern?.type;
    if (compType === "mixed") {
      boundaries.push({
        area: "Components",
        legacy: "Class components",
        modern: "Function components + Hooks",
        guidance: "New code: function components only. Do not convert existing class components unless the task requires it.",
      });
    }

    const deps = context.techStack.dependencies;
    const hasMobxReact = deps.some((d) => d.name === "mobx-react");
    const hasMobxReactLite = deps.some((d) => d.name === "mobx-react-lite");
    if (hasMobxReact && hasMobxReactLite) {
      boundaries.push({
        area: "MobX Observer",
        legacy: "`mobx-react` (class-based `@observer`)",
        modern: "`mobx-react-lite` (`observer` HOF)",
        guidance: "New code: import `observer` from `mobx-react-lite`. Existing `@observer` classes stay as-is.",
      });
    }

    const exportStyle = context.projectPractice?.componentPattern?.exportStyle;
    if (exportStyle === "mixed") {
      boundaries.push({
        area: "Export Style",
        legacy: "Default exports",
        modern: "Named exports",
        guidance: "New code: prefer named exports for better refactoring support. Match existing file's style when editing.",
      });
    }

    const hasReactRouter = deps.find((d) => d.name === "react-router-dom" || d.name === "react-router");
    if (hasReactRouter) {
      const major = hasReactRouter.version ? parseInt(hasReactRouter.version.replace(/^[\^~>=<]+/, ""), 10) : 0;
      if (major >= 6) {
        const hasV5Patterns = (context.codeFeatures?.["legacy-routing"]?.frequency ?? 0) > 0;
        if (hasV5Patterns) {
          boundaries.push({
            area: "Routing",
            legacy: "React Router v5 (`<Switch>`, `component` prop)",
            modern: "React Router v6+ (`<Routes>`, `element` prop)",
            guidance: "New routes: v6 API only. Migrate v5 routes only when the surrounding module is being refactored.",
          });
        }
      }
    }

    if (boundaries.length === 0) return "";

    let section = `\n## Legacy vs Modern Patterns\n\n`;
    section += `This project contains both legacy and modern patterns. Follow the guidance below:\n\n`;
    section += `| Area | Legacy | Modern (use for new code) | Guidance |\n`;
    section += `|------|--------|---------------------------|----------|\n`;
    for (const b of boundaries) {
      section += `| ${b.area} | ${b.legacy} | ${b.modern} | ${b.guidance} |\n`;
    }
    section += `\n`;
    return section;
}
