/**
 * 项目架构规则生成器
 *
 * 基于检测到的架构模式、模块结构与代码特征生成架构指南。
 * 一组自包含函数：入口 generateArchitectureRule + 内部 section helper。
 */

import * as path from "path";

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import {
  getLanguageGlobs,
  formatMissingPractices,
  getArchitecturePatternName,
  getModuleTypeName,
  getCategoryDisplayName,
} from "./rule-helpers.js";

export function generateArchitectureRule(
  context: RuleGenerationContext,
  missingPractices?: any[]
): CursorRule {
    const srcGlobs = getLanguageGlobs(context);
    const metadata = buildRuleMetadata(
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
    const additionalPractices = formatMissingPractices(
      architecturePractices
    );

    const codeFeaturesSection = generateCodeFeaturesSection(context);

    const content =
      metadata +
      `
# Project Architecture

See also: @global-rules.mdc, @project-structure.mdc

## Architecture Pattern

${
  context.architecturePattern
    ? generateArchitecturePatternSection(context.architecturePattern)
    : generateArchitecturePatternSection(context.architecturePattern || {
        type: "unknown",
        confidence: "low",
        indicators: []
      })
}

## Module Structure

${generateModuleStructureSection(context)}
${codeFeaturesSection}
## Design Principles

${generateArchitecturePrinciples(context)}

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

function generateArchitecturePatternSection(pattern: any): string {
    if (!pattern || pattern.type === "unknown") {
      return "项目架构模式：标准架构（基于目录结构推断）\n\n";
    }

    let content = `项目采用 **${getArchitecturePatternName(pattern.type)}** 架构模式。\n\n`;

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
 * 生成模块结构章节（基于 deepAnalysis 和 project-structure.mdc 的树形结构）
 */
function generateModuleStructureSection(context: RuleGenerationContext): string {
    // 优先使用 deepAnalysis 来生成模块结构摘要
    if (context.deepAnalysis && context.deepAnalysis.length > 0) {
      return generateModuleStructureFromDeepAnalysis(context);
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
      content += `### ${getModuleTypeName(type)}模块\n\n`;
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
      const categoryName = getCategoryDisplayName(category);

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
 * 生成架构设计原则
 */
function generateArchitecturePrinciples(context: RuleGenerationContext): string {
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
