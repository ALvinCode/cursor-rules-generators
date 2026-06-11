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

    // Value gate: only generate a standalone file when there's concrete
    // architectural detail beyond what global-rules & project-structure cover.
    const pattern = context.architecturePattern;
    const hasConcreteStructure = !!(pattern?.layerStructure || pattern?.featureStructure);
    const hasSubstantialContent =
      hasConcreteStructure ||
      !!additionalPractices ||
      !!platformArch ||
      (context.modules.length > 1);

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

    const content =
      metadata +
      `
# Project Architecture

See also: @global-rules.mdc, @project-structure.mdc

## Architecture Pattern

${generateArchitecturePatternSection(pattern)}

## Module Structure

${generateModuleStructureSection(context)}
${codeFeaturesSection}${principles ? `## Design Principles\n\n${principles}` : ""}${additionalPractices ? `## Additional Best Practices\n\n${additionalPractices}\n` : ""}${platformArch ? `\n${platformArch}\n` : ""}
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
