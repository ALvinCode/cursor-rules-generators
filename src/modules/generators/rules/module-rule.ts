/**
 * 模块概述规则生成器
 *
 * 为多模块项目的每个模块生成概述规则（职责、目录、代码生成指南）。
 * 模块结构/业务分析器无状态，按需在函数内实例化（不依赖生成器实例字段）。
 */

import { CursorRule, Module, RuleGenerationContext } from "../../../types.js";
import { FileUtils } from "../../../utils/file-utils.js";
import { logger } from "../../../utils/logger.js";
import * as path from "path";
import { buildRuleMetadata } from "./rule-metadata.js";
import type { ModuleStructureAnalysis } from "../../analyzers/module-structure-analyzer.js";
import type { ModuleBusinessAnalysis } from "../../analyzers/module-business-analyzer.js";
import { getModuleTypeName, sanitizeFileName } from "./rule-helpers.js";
import { ModuleStructureAnalyzer } from "../../analyzers/module-structure-analyzer.js";
import { ModuleBusinessAnalyzer } from "../../analyzers/module-business-analyzer.js";

/**
 * v1.3: 生成模块概述规则（简化版，约 200 行）
 */
export async function generateModuleOverviewRule(
  context: RuleGenerationContext,
  module: Module
): Promise<CursorRule> {
    const moduleOverviewGlobs = `${module.path}/**`;
    const metadata = buildRuleMetadata(
      `${module.name} 模块规则`,
      module.description || `Development conventions for the ${module.name} module`,
      50,
      context.techStack.primary,
      [module.type, "module"],
      "overview",
      ["global-rules"],
      { globs: moduleOverviewGlobs }
    );

    // 分析模块结构和业务信息（分析器无状态，按需实例化）
    const structureAnalysis = context.deepAnalysis
      ? new ModuleStructureAnalyzer().analyzeModuleStructure(
          module,
          context.deepAnalysis,
          context.projectPath
        )
      : null;

    const businessAnalysis = context.deepAnalysis
      ? await new ModuleBusinessAnalyzer().analyzeModuleBusiness(
          module,
          context,
          context.deepAnalysis
        )
      : null;

    let content = metadata + `\n# ${module.name} 模块\n\n`;

    // 1. 模块标识（关键信息，用于代码生成时识别目标模块）
    const packageName = module.packageName || module.name;
    const packageInfo = await getModulePackageInfo(module.path);
    const effectivePackageName = packageInfo?.name || packageName;
    
    content += `## 📦 模块标识\n\n`;
    content += `- **包名称**: \`${effectivePackageName}\`\n`;
    content += `- **模块名称**: \`${module.name}\`\n`;
    content += `- **模块类型**: ${getModuleTypeName(module.type)}\n`;
    if (packageInfo?.description) {
      content += `- **描述**: ${packageInfo.description}\n`;
    }
    content += `\n`;

    // 2. 模块职责
    content += `## 🎯 模块职责\n\n`;
    content += `${generateModuleResponsibilities(module, businessAnalysis)}\n\n`;

    // 3. 目录结构（引用 project-structure）
    content += `## 📁 目录结构\n\n`;
    content += `**MUST**: 在生成代码前，查看 @project-structure.mdc 中 \`${module.name}\` 模块的目录结构和文件夹职能说明。\n\n`;
    content += `目录结构信息位于 @project-structure.mdc，包含：\n`;
    content += `- 完整的目录树结构\n`;
    content += `- 每个目录的职能说明\n`;
    content += `- 文件组织模式和命名规范\n\n`;

    // 4. 代码生成指南
    content += `## 💻 代码生成指南\n\n`;
    content += generateModuleCodeGenerationGuide(module, context, structureAnalysis, businessAnalysis, effectivePackageName);

    // 5. 相关规则
    content += `## 📚 相关规则\n\n`;
    content += `参考以下全局规则：\n\n`;
    content += `- @../global-rules.mdc\n`;
    content += `- @../code-style.mdc\n`;
    content += `- @../architecture.mdc\n`;
    content += `- @../project-structure.mdc\n\n`;

    return {
      scope: "module",
      moduleName: module.name,
      modulePath: module.path,
      content,
      fileName: `${sanitizeFileName(module.name)}-overview.mdc`,
      priority: 50,
      type: "overview",
      depends: ["global-rules"],
    };
}

/**
 * 生成模块职责说明
 */
function generateModuleResponsibilities(
  module: Module,
  businessAnalysis?: ModuleBusinessAnalysis | null
): string {
    let description = "";

    // 如果有业务分析，使用业务领域信息
    if (businessAnalysis?.businessDomain) {
      description = `负责 ${businessAnalysis.businessDomain} 相关的功能`;
    } else {
    const typeDescriptions: Record<string, string> = {
      frontend: "负责用户界面展示和交互逻辑",
      backend: "负责业务逻辑处理和数据管理",
      shared: "提供跨模块共享的工具和类型定义",
      service: "提供特定领域的服务功能",
      package: "作为独立包提供特定功能",
      other: "提供项目所需的功能",
    };
      description = typeDescriptions[module.type] || "提供项目所需的功能";
    }

    // 如果有主要功能，添加到描述中
    if (businessAnalysis?.mainFeatures && businessAnalysis.mainFeatures.length > 0) {
      description += `，主要包括：${businessAnalysis.mainFeatures.slice(0, 3).join("、")}`;
    }

    return description;
}

/**
 * 获取模块的 package.json 信息
 */
async function getModulePackageInfo(modulePath: string): Promise<{
  name?: string;
  description?: string;
  keywords?: string[];
  version?: string;
} | null> {
    const packageJsonPath = path.join(modulePath, "package.json");
    
    if (await FileUtils.fileExists(packageJsonPath)) {
      try {
        const content = await FileUtils.readFile(packageJsonPath);
        const data = JSON.parse(content);
        return {
          name: data.name,
          description: data.description,
          keywords: data.keywords,
          version: data.version,
        };
      } catch (error) {
        logger.debug(`读取 package.json 失败: ${packageJsonPath}`, error);
      }
    }
    
    return null;
}

/**
 * 生成模块代码生成指南（优化版，符合 Cursor Rules 最佳实践）
 */
function generateModuleCodeGenerationGuide(
  module: Module,
  context: RuleGenerationContext,
  structureAnalysis: ModuleStructureAnalysis | null,
  businessAnalysis: ModuleBusinessAnalysis | null,
  packageName: string
): string {
    let guide = "";

    // 代码生成规则（使用明确的指令格式）
    guide += `### 代码生成规则\n\n`;
    guide += `**MUST** 遵循以下规则：\n\n`;
    guide += `1. **文件位置**: 查看 @project-structure.mdc 中 \`${module.name}\` 模块的目录结构，根据文件类型选择正确目录\n`;
    guide += `2. **命名规范**: 参考 @code-style.mdc 和 @project-structure.mdc\n`;
    guide += `3. **导入路径**: 遵循依赖引用规则（见下文）\n`;
    guide += `4. **代码风格**: 参考 @code-style.mdc 保持一致性\n`;
    
    if (module.type === "shared") {
      guide += `5. **模块边界**: 此模块为共享模块，代码必须保持通用性，避免特定业务逻辑\n\n`;
    } else {
      guide += `5. **模块边界**: 此模块为 ${getModuleTypeName(module.type)} 类型，代码需符合该类型职责范围\n\n`;
    }

    // 文件存放规则（从 project-structure 获取）
    guide += `### 文件存放规则\n\n`;
    guide += `**MUST**: 参考 @project-structure.mdc 中 \`${module.name}\` 模块的目录结构和文件夹职能说明。\n\n`;
    
    if (structureAnalysis && structureAnalysis.mainDirectories.length > 0) {
      const dirs = structureAnalysis.mainDirectories
        .filter((d) => {
          if (d.fileCount === 0 || !d.purpose || d.purpose === "") return false;
          // 只判断英文，不判断中文
          const purposeLower = d.purpose.toLowerCase();
          return purposeLower !== 'other' && purposeLower !== 'unknown';
        })
        .slice(0, 8);
      
      if (dirs.length > 0) {
        guide += `主要目录（完整信息见 @project-structure.mdc）：\n\n`;
        for (const dir of dirs) {
          const dirPath = dir.path;
          // 计算相对于模块路径的相对路径
          let relativePath: string;
          try {
            relativePath = path.relative(module.path, dirPath);
            // 如果路径相同，使用目录名
            if (!relativePath || relativePath === ".") {
              relativePath = path.basename(dirPath);
            }
          } catch {
            relativePath = path.basename(dirPath);
          }
          
          guide += `- \`${relativePath}/\`: ${dir.purpose}`;
          if (dir.namingPattern && dir.namingPattern !== "mixed") {
            guide += ` (${dir.namingPattern})`;
          }
          guide += `\n`;
        }
        guide += `\n`;
      }
    }

    // 依赖引用规则（使用明确的指令格式）
    guide += `### 依赖引用规则\n\n`;
    
    guide += `**模块内部引用** (SHOULD):\n`;
    guide += `\`\`\`typescript\n`;
    guide += `import { X } from '../utils/helper';\n`;
    guide += `import { X } from '@/utils/helper'; // 如果配置了别名\n`;
    guide += `\`\`\`\n\n`;
    
    // 引用其他内部模块
    if (businessAnalysis && businessAnalysis.internalDependencies.length > 0) {
      guide += `**引用其他内部模块** (SHOULD):\n`;
      guide += `\`\`\`typescript\n`;
      for (const dep of businessAnalysis.internalDependencies.slice(0, 3)) {
        guide += `import { X } from '${dep}';\n`;
      }
      guide += `\`\`\`\n\n`;
    }
    
    // 被其他模块引用
    if (businessAnalysis && businessAnalysis.dependentModules.length > 0) {
      guide += `**被其他模块引用** (参考):\n`;
      guide += `其他模块可通过包名引用：\`import { X } from '${packageName}'\`\n\n`;
    }
    
    // 外部依赖
    guide += `**外部依赖** (SHOULD):\n`;
    guide += `\`\`\`typescript\n`;
    guide += `import { X } from 'package-name';\n`;
    guide += `\`\`\`\n\n`;

    // 命名规范（仅在有明确模式时显示）
    if (structureAnalysis && structureAnalysis.fileOrganizationPattern.primaryNamingPattern !== "mixed") {
      guide += `### 命名规范\n\n`;
      const pattern = structureAnalysis.fileOrganizationPattern.primaryNamingPattern;
      guide += `主要命名模式: **${pattern}**\n\n`;
      guide += `示例：\n`;
      if (pattern === "PascalCase") {
        guide += `- \`UserProfile.tsx\`, \`ApiClient.ts\`, \`UserType.ts\`\n`;
      } else if (pattern === "camelCase") {
        guide += `- \`getUserData.ts\`, \`apiClient.ts\`, \`userHelper.ts\`\n`;
      } else if (pattern === "kebab-case") {
        guide += `- \`user-profile.tsx\`, \`api-client.ts\`, \`user-helper.ts\`\n`;
      }
      guide += `\n`;
      guide += `完整规范见 @code-style.mdc\n\n`;
    }

    // 导入导出模式（仅在有明确模式时显示）
    if (structureAnalysis && structureAnalysis.fileOrganizationPattern.usesIndexFiles) {
      guide += `### 导入导出模式\n\n`;
      guide += `使用 \`index.ts\` 作为目录入口：\n`;
      guide += `\`\`\`typescript\n`;
      guide += `// 从目录导入\n`;
      guide += `import { Component } from './components';\n`;
      guide += `\`\`\`\n\n`;
    }

    return guide;
}
