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
      `${module.name} Module Rules`,
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

    let content = metadata + `\n# ${module.name} Module\n\n`;

    // 1. 模块标识（关键信息，用于代码生成时识别目标模块）
    const packageName = module.packageName || module.name;
    const packageInfo = await getModulePackageInfo(module.path);
    const effectivePackageName = packageInfo?.name || packageName;
    
    content += `## 📦 Module Identity\n\n`;
    content += `- **Package name**: \`${effectivePackageName}\`\n`;
    content += `- **Module name**: \`${module.name}\`\n`;
    content += `- **Module type**: ${getModuleTypeName(module.type)}\n`;
    if (packageInfo?.description) {
      content += `- **Description**: ${packageInfo.description}\n`;
    }
    content += `\n`;

    // 2. 模块职责
    content += `## 🎯 Module Responsibilities\n\n`;
    content += `${generateModuleResponsibilities(module, businessAnalysis)}\n\n`;

    // 3. 目录结构（引用 project-structure）
    content += `## 📁 Directory Structure\n\n`;
    content += `**MUST**: Before generating code, review the directory tree and folder purpose descriptions for the \`${module.name}\` module in @project-structure.mdc.\n\n`;
    content += `@project-structure.mdc includes:\n`;
    content += `- Full directory tree\n`;
    content += `- Purpose description for each directory\n`;
    content += `- File organization patterns and naming conventions\n\n`;

    // 4. 代码生成指南
    content += `## 💻 Code Generation Guide\n\n`;
    content += generateModuleCodeGenerationGuide(module, context, structureAnalysis, businessAnalysis, effectivePackageName);

    // 5. 相关规则
    content += `## 📚 Related Rules\n\n`;
    content += `See also these global rules:\n\n`;
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
      description = `Handles ${businessAnalysis.businessDomain}-related functionality`;
    } else {
    const typeDescriptions: Record<string, string> = {
      frontend: "Handles user interface presentation and interaction logic",
      backend: "Handles business logic and data management",
      shared: "Provides cross-module shared utilities and type definitions",
      service: "Provides domain-specific services",
      package: "Provides specific functionality as a standalone package",
      other: "Provides functionality required by the project",
    };
      description = typeDescriptions[module.type] || "Provides functionality required by the project";
    }

    // 如果有主要功能，添加到描述中
    if (businessAnalysis?.mainFeatures && businessAnalysis.mainFeatures.length > 0) {
      description += `, including: ${businessAnalysis.mainFeatures.slice(0, 3).join(", ")}`;
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
    guide += `### Code Generation Rules\n\n`;
    guide += `**MUST** follow these rules:\n\n`;
    guide += `1. **File location**: Review the directory structure for the \`${module.name}\` module in @project-structure.mdc and choose the correct directory by file type\n`;
    guide += `2. **Naming conventions**: See @code-style.mdc and @project-structure.mdc\n`;
    guide += `3. **Import paths**: Follow dependency reference rules (below)\n`;
    guide += `4. **Code style**: See @code-style.mdc for consistency\n`;
    
    if (module.type === "shared") {
      guide += `5. **Module boundary**: This is a shared module; keep code generic and avoid business-specific logic\n\n`;
    } else {
      guide += `5. **Module boundary**: This is a ${getModuleTypeName(module.type)} module; code must stay within that responsibility scope\n\n`;
    }

    // 文件存放规则（从 project-structure 获取）
    guide += `### File Placement Rules\n\n`;
    guide += `**MUST**: See directory structure and folder purpose descriptions for the \`${module.name}\` module in @project-structure.mdc.\n\n`;
    
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
        guide += `Key directories (full details in @project-structure.mdc):\n\n`;
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
    guide += `### Dependency Reference Rules\n\n`;
    
    guide += `**Within module** (SHOULD):\n`;
    guide += `\`\`\`typescript\n`;
    guide += `import { X } from '../utils/helper';\n`;
    guide += `import { X } from '@/utils/helper'; // when aliases are configured\n`;
    guide += `\`\`\`\n\n`;
    
    // 引用其他内部模块
    if (businessAnalysis && businessAnalysis.internalDependencies.length > 0) {
      guide += `**Other internal modules** (SHOULD):\n`;
      guide += `\`\`\`typescript\n`;
      for (const dep of businessAnalysis.internalDependencies.slice(0, 3)) {
        guide += `import { X } from '${dep}';\n`;
      }
      guide += `\`\`\`\n\n`;
    }
    
    // 被其他模块引用
    if (businessAnalysis && businessAnalysis.dependentModules.length > 0) {
      guide += `**Referenced by other modules** (Reference):\n`;
      guide += `Other modules may import via package name: \`import { X } from '${packageName}'\`\n\n`;
    }
    
    // 外部依赖
    guide += `**External dependencies** (SHOULD):\n`;
    guide += `\`\`\`typescript\n`;
    guide += `import { X } from 'package-name';\n`;
    guide += `\`\`\`\n\n`;

    // 命名规范（仅在有明确模式时显示）
    if (structureAnalysis && structureAnalysis.fileOrganizationPattern.primaryNamingPattern !== "mixed") {
      guide += `### Naming Conventions\n\n`;
      const pattern = structureAnalysis.fileOrganizationPattern.primaryNamingPattern;
      guide += `Primary naming pattern: **${pattern}**\n\n`;
      guide += `Examples:\n`;
      if (pattern === "PascalCase") {
        guide += `- \`UserProfile.tsx\`, \`ApiClient.ts\`, \`UserType.ts\`\n`;
      } else if (pattern === "camelCase") {
        guide += `- \`getUserData.ts\`, \`apiClient.ts\`, \`userHelper.ts\`\n`;
      } else if (pattern === "kebab-case") {
        guide += `- \`user-profile.tsx\`, \`api-client.ts\`, \`user-helper.ts\`\n`;
      }
      guide += `\n`;
      guide += `Full conventions in @code-style.mdc\n\n`;
    }

    // 导入导出模式（仅在有明确模式时显示）
    if (structureAnalysis && structureAnalysis.fileOrganizationPattern.usesIndexFiles) {
      guide += `### Import/Export Pattern\n\n`;
      guide += `Use \`index.ts\` as the directory entry point:\n`;
      guide += `\`\`\`typescript\n`;
      guide += `// Import from directory\n`;
      guide += `import { Component } from './components';\n`;
      guide += `\`\`\`\n\n`;
    }

    return guide;
}
