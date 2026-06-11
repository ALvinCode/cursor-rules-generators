/**
 * 项目结构规则生成器
 *
 * 生成目录结构树、目录职能说明、文件组织规范与新建文件指南。
 * 自包含：通过动态 import 重建分析器，不依赖生成器实例状态。
 */

import * as path from "path";

import {
  CursorRule,
  RuleGenerationContext,
  FileOrganizationInfo,
  DeepDirectoryAnalysis,
  DirectoryPurpose,
} from "../../../types.js";
import { logger } from "../../../utils/logger.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import { isFrontendProject } from "./rule-helpers.js";

/**
 * 职能文件夹关键词（用于区分职能目录与业务目录）
 *
 * 这些词代表项目按"职能/技术职责"组织的目录（如 components、utils、api 等），
 * 与业务名词（如 user、order、checkout）形成对照。
 */
const FUNCTIONAL_FOLDER_KEYWORDS = [
  // 组件和页面容器（职能层）
  'component', 'components', 'cmp',
  'page', 'pages', 'view', 'views',
  // Hooks 和工具
  'hook', 'hooks',
  'util', 'utils', 'utilities', 'helper', 'helpers',
  // API 和服务
  'api', 'apis', 'service', 'services',
  // 类型和模型
  'type', 'types', 'interface', 'interfaces',
  'model', 'models', 'entity', 'entities',
  'dto', 'dao', 'schema', 'schemas',
  // 状态管理
  'store', 'stores', 'state',
  // 样式
  'style', 'styles', 'css', 'scss', 'sass', 'less',
  // 配置
  'config', 'configs', 'configuration',
  // 测试
  'test', 'tests', '__tests__', '__mocks__', 'mock', 'mocks',
  // 功能模块
  'feature', 'features', 'module', 'modules',
  // 共享和公共
  'shared', 'common', 'lib', 'libs', 'library',
  // 路由
  'route', 'routes', 'router',
  // 后端相关
  'middleware', 'controller', 'controllers',
  'repository', 'repositories',
  'guard', 'guards', 'interceptor', 'interceptors',
  'pipe', 'pipes', 'filter', 'filters',
  'decorator', 'decorators',
  // 布局
  'layout', 'layouts',
  // 常量
  'constant', 'constants', 'enum', 'enums',
  // 验证和格式化
  'validator', 'validators', 'formatter', 'formatters',
  // 适配器
  'adapter', 'adapters',
  // 提供者
  'provider', 'providers', 'factory', 'factories',
  // 策略
  'strategy', 'strategies',
  // 数据库相关
  'migration', 'migrations', 'seed', 'seeds',
  // 资源
  'asset', 'assets', 'static', 'public',
  // 国际化
  'locale', 'locales', 'i18n',
  // 主题
  'theme', 'themes',
  // 模板
  'template', 'templates', 'partial', 'partials',
  // 容器
  'container', 'containers',
  // 架构层
  'presentation', 'presentations', 'domain', 'domains',
  'infrastructure', 'infrastructures', 'application', 'applications',
  // 核心
  'core', 'kernel', 'base', 'bases',
  // 内部和外部
  'internal', 'internals', 'external', 'externals',
  // 第三方
  'vendor', 'vendors', 'third-party', 'thirdparties',
  // 插件和扩展
  'plugin', 'plugins', 'extension', 'extensions',
  // 工具和脚本
  'tool', 'tools', 'script', 'scripts',
  // 构建输出
  'bin', 'build', 'dist', 'out',
  // 文档
  'doc', 'docs', 'documentation',
  // 示例
  'example', 'examples', 'demo', 'demos', 'sample', 'samples',
] as const;

/**
 * v1.8: 生成项目结构规则（独立文件，约 300 行）
 * 包含完整的目录结构、职能说明、文件组织规范
 *
 * 如果 context 中的 deepAnalysis 数据不完整，会尝试重新获取
 */
export async function generateProjectStructureRule(
  context: RuleGenerationContext
): Promise<CursorRule> {
    // 检查并确保有完整的 deepAnalysis 数据
    await ensureDeepAnalysisData(context);
    
    const indexGlobs = "**/index.{ts,tsx,js,jsx}";
    const metadata = buildRuleMetadata(
      "Project Structure",
      "Consult when creating new files or directories to determine correct location and naming conventions",
      85,
      context.techStack.primary,
      ["structure", "directory", "file-organization"],
      "reference",
      ["global-rules"],
      { globs: indexGlobs }
    );

    const content =
      metadata +
      `
# Project Structure

See also: @global-rules.mdc

${generateDetailedStructureContent(context)}

---
*Before creating new files, see this file for correct directory locations and naming conventions.*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "project-structure.mdc",
      priority: 85,
      type: "reference",
      depends: ["global-rules"],
    };
}

/**
 * 生成备用项目结构规则（当主生成方法失败时使用）
 * 确保 project-structure.mdc 文件总是被创建
 */
export function generateFallbackProjectStructureRule(
  context: RuleGenerationContext
): CursorRule {
    const metadata = buildRuleMetadata(
      "Project Structure",
      "Consult when creating new files or directories to determine correct location and naming conventions",
      85,
      context.techStack.primary,
      ["structure", "directory", "file-organization"],
      "reference",
      ["global-rules"]
    );

    let content = metadata + `
# Project Structure

See also: @global-rules.mdc

> ⚠️ **Note**: Analysis encountered issues; the following is a simplified project structure overview. Re-run \`generate_cursor_rules\` for the full directory tree and purpose descriptions.

## 📁 Directory Tree

Project directory structure analysis is temporarily unavailable. Refer to the project's actual directory layout.

`;

    // 尝试使用 fileOrganization 生成简化结构
    if (context.fileOrganization && context.fileOrganization.structure.length > 0) {
      content += `## 🎯 File Organization (Quick Reference)\n\n`;
      content += `Common file type locations:\n\n`;
      content += generateFileOrganizationRules(context);
      content += `\n`;
    } else {
      // 如果连 fileOrganization 都没有，生成最基础的指南
      content += `## 🎯 File Organization\n\n`;
      content += `File organization guidelines pending. Suggested layout:\n\n`;
      content += `- Place components in \`src/components/\` or similar\n`;
      content += `- Place utilities in \`src/utils/\` or similar\n`;
      content += `- Place type definitions in \`src/types/\` or similar\n`;
      content += `- Place API files in \`src/api/\` or similar\n\n`;
    }

    // 添加新建文件指南
    content += `## ✨ New File Guidelines\n\n`;
    content += generateNewFileGuidelines(context);
    content += `\n`;

    content += `---
*Before creating new files, see this file for correct directory locations and naming conventions.*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "project-structure.mdc",
      priority: 85,
      type: "reference",
      depends: ["global-rules"],
    };
}

/**
 * 确保有完整的深度分析数据
 * 如果数据缺失或不完整，尝试重新获取
 */
async function ensureDeepAnalysisData(
  context: RuleGenerationContext
): Promise<void> {
    // 评估当前数据质量
    const quality = assessDeepAnalysisQuality(context.deepAnalysis);
    
    // 如果数据完整且质量良好，直接返回
    if (quality.quality === "good") {
      logger.info("深度分析数据质量良好，无需重新获取");
      return;
    }
    
    // 如果数据缺失或质量差，尝试重新获取
    logger.warn(`深度分析数据质量: ${quality.quality}，原因: ${quality.reason}`);
    logger.info("尝试重新获取完整的深度分析数据...");
    
    try {
      // 动态导入 DeepDirectoryAnalyzer
      const { DeepDirectoryAnalyzer } = await import("../../analyzers/deep-directory-analyzer.js");
      const { ProjectAnalyzer } = await import("../../core/project-analyzer.js");
      
      // 优先使用 context 中保存的文件列表
      let files: string[] = context.files || [];
      
      // 如果 context 中没有文件列表，重新收集
      if (files.length === 0) {
        logger.info("context 中未保存文件列表，重新收集...");
        const projectAnalyzer = new ProjectAnalyzer();
        files = await projectAnalyzer.collectFiles(context.projectPath);
        logger.info(`重新收集文件: ${files.length} 个`);
      } else {
        logger.info(`使用 context 中的文件列表: ${files.length} 个`);
      }
      
      // 验证文件列表不为空
      if (files.length === 0) {
        logger.error("文件列表为空，无法执行深度分析");
        return;
      }
      
      // 创建深度分析器并重新分析
      const deepAnalyzer = new DeepDirectoryAnalyzer();
      
      // 设置依赖信息（保持完整的 Dependency 类型）
      const dependencies = context.techStack.dependencies.map((d) => ({
        name: d.name,
        version: d.version,
        type: d.type || ("dependency" as const),
        category: d.category,
      }));
      await deepAnalyzer.setDependencies(dependencies);
      
      // 执行深度分析
      const newDeepAnalysis = await deepAnalyzer.analyzeProjectStructure(
        context.projectPath,
        files,
        context.modules || [],
        dependencies
      );
      
      logger.info(`重新获取深度分析数据: ${newDeepAnalysis.length} 个目录`);
      
      // 更新 context
      context.deepAnalysis = newDeepAnalysis;
      
      // 重新识别架构模式
      if (newDeepAnalysis.length > 0) {
        context.architecturePattern = await deepAnalyzer.identifyArchitecturePattern(
          newDeepAnalysis,
          context.projectPath,
          files
        );
        logger.info(`重新识别架构模式: ${context.architecturePattern.type}`);
      }
      
      // 再次评估质量
      const newQuality = assessDeepAnalysisQuality(context.deepAnalysis);
      logger.info(`重新获取后的数据质量: ${newQuality.quality}`);
      
      if (newQuality.quality === "missing" || newQuality.quality === "poor") {
        logger.error("重新获取后数据质量仍然不佳，将使用简化版结构");
      }
    } catch (error) {
      logger.error("重新获取深度分析数据失败", error);
      // 失败后继续使用原有数据（可能是简化版）
    }
}

/**
 * 生成详细的项目结构内容（优化版：完整的目录树和职能说明）
 */
function generateDetailedStructureContent(
  context: RuleGenerationContext
): string {
    let content = "";

    // 检查深度分析数据的完整性（安全处理 undefined）
    const deepAnalysis = context.deepAnalysis || [];
    const hasDeepAnalysis = deepAnalysis.length > 0;
    const deepAnalysisQuality = assessDeepAnalysisQuality(deepAnalysis);

    // 1. 目录结构树（完整树形结构，优先显示）
    // 使用与 test-report 相同的生成逻辑，确保完整性和一致性
    if (hasDeepAnalysis) {
      content += `## 📁 Directory Tree\n\n`;
      
      // 如果数据质量不佳，添加警告提示
      if (deepAnalysisQuality.isIncomplete) {
        content += `> ⚠️ **Note**: Directory structure analysis may be incomplete (${deepAnalysisQuality.reason}). Re-generate for the full structure.\n\n`;
      }
      
      content += `Main project directory structure:\n\n`;
      content += generateDirectoryTree(deepAnalysis);
      content += `\n`;
    } else {
      // 如果没有深度分析结果，使用 fileOrganization 生成简化结构
        content += `## 📁 Directory Tree\n\n`;
      content += `> ⚠️ **Warning**: Full directory depth analysis was unavailable; the following is simplified. Re-run \`generate_cursor_rules\` for the full directory tree and purpose descriptions.\n\n`;
      
      if (context.fileOrganization && context.fileOrganization.structure.length > 0) {
        content += `Main project directory structure (simplified):\n\n`;
        content += generateSimplifiedDirectoryTree(context.fileOrganization);
        content += `\n`;
      } else {
        content += `> ❌ **Error**: Unable to generate directory structure; check project path and file permissions.\n\n`;
      }
    }

    // 3. 主要目录职能说明（详细说明，重要目录）
    if (hasDeepAnalysis) {
      content += `## 📋 Directory Purpose Reference\n\n`;
      content += `Detailed purpose for important directories, including file types and naming conventions:\n\n`;
      const relativeFiles = (context.files ?? []).map(
        (f) => path.relative(context.projectPath, f)
      );
      content += generateDirectoryPurposes(deepAnalysis, relativeFiles);
      content += `\n`;
    } else {
      // 如果没有深度分析，跳过职能说明章节
      content += `> ℹ️ **Tip**: Detailed directory purpose descriptions are unavailable due to missing depth analysis data.\n\n`;
    }

    // 4. 文件组织规范（快速参考）
    if (context.fileOrganization) {
      content += `## 🎯 File Organization (Quick Reference)\n\n`;
      content += `Common file type locations for quick lookup:\n\n`;
      content += generateFileOrganizationRules(context);
      content += `\n`;
    }

    // 5. 新建文件指南
    content += `## ✨ New File Guidelines\n\n`;
    content += generateNewFileGuidelines(context);
    content += `\n`;

    return content;
}

/**
 * 生成简化的目录树（基于 fileOrganization）
 */
function generateSimplifiedDirectoryTree(fileOrg: FileOrganizationInfo): string {
    const tree: string[] = [];
    const structure = fileOrg.structure || [];
    
    // 按路径深度排序
    const sorted = [...structure].sort((a: DirectoryPurpose, b: DirectoryPurpose) => {
      const aDepth = a.path.split("/").length;
      const bDepth = b.path.split("/").length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.path.localeCompare(b.path);
    });

    const maxDepth = 3;
    const filtered = sorted.filter((d: DirectoryPurpose) => {
      const depth = d.path.split("/").length;
      return depth <= maxDepth;
    });

    for (const dir of filtered) {
      const depth = dir.path.split("/").length;
      const indent = "  ".repeat(depth - 1);
      const prefix = depth > 1 ? "├── " : "";
      const fileCount = dir.fileCount > 0 ? ` (${dir.fileCount} files)` : "";
      tree.push(
        `${indent}${prefix}${dir.path}/  # ${dir.purpose || "directory"}${fileCount}`
      );
    }

    return `\`\`\`\n${tree.join("\n")}\n\`\`\`\n\n`;
}

/**
 * 生成目录树结构（完整版，包含所有目录层级）
 * 使用与 test-report 逻辑完全一致，但确保显示完整的目录树
 */
function generateDirectoryTree(
  deepAnalysis: DeepDirectoryAnalysis[]
): string {
    if (deepAnalysis.length === 0) {
      return "```text\nAnalyzing project directory structure...\n```\n\n";
    }

    // 按层级组织目录（与 test-report 完全一致的逻辑）
    const tree: string[] = [];
    
    // 找到根目录 (depth === 1)，与 test-report 保持一致
    const rootDirs = deepAnalysis.filter((d) => d.depth === 1);
    
    // 恢复排序逻辑，确保与 test-report 一致（test-report 是按字母排序的）
    rootDirs.sort((a, b) => {
      const aName = path.basename(a.path);
      const bName = path.basename(b.path);
      return aName.localeCompare(bName);
    });

    // 纯样式/资源目录：深度限制为 2（避免 styles/antd/xxx 等深链条）
    const SHALLOW_DIRS = new Set(['styles', 'style', 'assets', 'images', 'icons', 'fonts', 'public', 'static']);

    const buildTree = (
      dir: DeepDirectoryAnalysis,
      prefix: string,
      isLast: boolean,
      currentDepth = 1
    ) => {
      const connector = isLast ? "└── " : "├── ";
      const dirName = path.basename(dir.path);

      // 样式/资源目录折叠深度限制为 2
      const parentName = path.basename(dir.path.split('/').slice(0, -1).join('/') || '');
      const isUnderShallowDir = SHALLOW_DIRS.has(parentName.toLowerCase());
      const maxDepth = isUnderShallowDir ? 2 : 4;

      // 超过最大深度时折叠
      if (currentDepth > maxDepth) {
        tree.push(`${prefix}${connector}${dirName}/`);
        return;
      }

      // 找到所有子目录
      const children = deepAnalysis.filter(
        (d) => d.parentDirectory === dir.path
      );
      
      // 分离职能子目录和业务子目录
      const functionalChildren = children.filter(child => 
        !isBusinessFolder(child, deepAnalysis)
      );
      const businessChildren = children.filter(child => 
        isBusinessFolder(child, deepAnalysis)
      );
      
      // 如果有业务子目录，显示为折叠形式
      if (businessChildren.length > 0 && functionalChildren.length === 0) {
        // 只有业务子目录，显示为 ... (N个业务文件夹)
        // 只判断英文，不判断中文
        const purposeLower = (dir.purpose || '').toLowerCase();
        const hasValidPurpose = dir.purpose && 
                                dir.purpose !== "" && 
                                purposeLower !== 'other' && 
                                purposeLower !== 'unknown';
        const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";
        tree.push(`${prefix}${connector}${dirName}/ ... (${businessChildren.length} business folders)${purpose}`);
        return; // 不展开业务文件夹
      }
      
      // 如果有职能子目录，正常显示
      if (functionalChildren.length > 0) {
        // 只判断英文，不判断中文
        const purposeLower = (dir.purpose || '').toLowerCase();
        const hasValidPurpose = dir.purpose && 
                                dir.purpose !== "" && 
                                purposeLower !== 'other' && 
                                purposeLower !== 'unknown';
        const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";
        tree.push(`${prefix}${connector}${dirName}/${purpose}`);
        
        // 只递归处理职能子目录
        functionalChildren.sort((a, b) => {
        const aName = path.basename(a.path);
        const bName = path.basename(b.path);
        return aName.localeCompare(bName);
      });

        functionalChildren.forEach((child, index) => {
          const isLastChild = index === functionalChildren.length - 1 && businessChildren.length === 0;
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        buildTree(child, childPrefix, isLastChild, currentDepth + 1);
      });
        
        // 如果有业务子目录，在最后显示折叠提示
        if (businessChildren.length > 0) {
          const businessPrefix = prefix + (isLast ? "    " : "│   ");
          tree.push(`${businessPrefix}└── ... (${businessChildren.length} business folders)`);
        }
      } else {
        // 没有子目录，正常显示
        // 只判断英文，不判断中文
        const purposeLower = (dir.purpose || '').toLowerCase();
        const hasValidPurpose = dir.purpose && 
                                dir.purpose !== "" && 
                                purposeLower !== 'other' && 
                                purposeLower !== 'unknown';
        const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";
        tree.push(`${prefix}${connector}${dirName}/${purpose}`);
      }
    };

    // 构建所有根目录的树（确保所有根目录都被包含）
    rootDirs.forEach((dir, index) => {
      buildTree(dir, "", index === rootDirs.length - 1);
    });

    // 检查是否有遗漏的目录（没有父目录且不是根目录）
    const orphanDirs = deepAnalysis.filter(
      (d) => d.depth > 1 && !deepAnalysis.some((parent) => parent.path === d.parentDirectory)
    );
    
    if (orphanDirs.length > 0) {
      tree.push("\n# Other directories (uncategorized)");
      orphanDirs.forEach((dir) => {
        const dirName = path.basename(dir.path);
        // 只判断英文，不判断中文
        const purposeLower = (dir.purpose || '').toLowerCase();
        const hasValidPurpose = dir.purpose && 
                                dir.purpose !== "" && 
                                purposeLower !== 'other' && 
                                purposeLower !== 'unknown';
        const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";
        tree.push(`├── ${dirName}/${purpose}`);
      });
    }

    // 返回带代码块的格式（使用 text 类型以保持纯文本显示）
    return `\`\`\`text\n${tree.join("\n")}\n\`\`\`\n\n`;
}

/**
 * 判断目录是否为业务性文件夹（需要过滤掉）
 */
function isBusinessFolder(dir: DeepDirectoryAnalysis, deepAnalysis: DeepDirectoryAnalysis[]): boolean {
    const functionalFolderKeywords = FUNCTIONAL_FOLDER_KEYWORDS;

    // 优先检查目录名：如果目录名本身是强职能关键词，直接认定为职能文件夹（非业务）
    // 这可以防止因 purpose 描述不准确（如包含中文）导致的误判
    const dirName = path.basename(dir.path).toLowerCase();
    // 完全匹配或常见的复数形式
    const isExactFunctionalName = functionalFolderKeywords.some(keyword => 
      dirName === keyword
    );
    
    if (isExactFunctionalName) {
      return false;
    }

    // 标准1: purpose 包含业务性词汇
    if (dir.purpose) {
      const purpose = dir.purpose.toLowerCase();
      
      // 纯职能关键词列表（英文），用于判断 purpose 是否为纯职能描述
      // 如果 purpose 只包含这些关键词，说明是纯职能，不是业务性
      const pureFunctionalKeywords = [
        // 组件和页面
        'page', 'pages', 'component', 'components', 'view', 'views',
        // Hooks 和工具
        'hook', 'hooks', 'util', 'utils', 'utilities', 'helper', 'helpers',
        // API 和服务
        'api', 'apis', 'service', 'services',
        // 类型和模型
        'type', 'types', 'interface', 'interfaces', 'model', 'models', 
        'entity', 'entities', 'dto', 'dao', 'schema', 'schemas',
        // 状态管理
        'store', 'stores', 'state',
        // 样式
        'style', 'styles', 'css', 'scss', 'sass', 'less',
        // 配置
        'config', 'configs', 'configuration',
        // 测试
        'test', 'tests', 'mock', 'mocks',
        // 功能模块
        'feature', 'features', 'module', 'modules',
        // 共享和公共
        'shared', 'common', 'lib', 'libs', 'library',
        // 路由
        'route', 'routes', 'router',
        // 后端相关
        'middleware', 'controller', 'controllers', 'repository', 'repositories',
        'guard', 'guards', 'interceptor', 'interceptors', 'pipe', 'pipes',
        'filter', 'filters', 'decorator', 'decorators',
        // 布局
        'layout', 'layouts',
        // 常量
        'constant', 'constants', 'enum', 'enums',
        // 验证和格式化
        'validator', 'validators', 'formatter', 'formatters',
        // 适配器
        'adapter', 'adapters',
        // 提供者
        'provider', 'providers', 'factory', 'factories',
        // 策略
        'strategy', 'strategies',
        // 数据库相关
        'migration', 'migrations', 'seed', 'seeds',
        // 资源
        'asset', 'assets', 'static', 'public',
        // 国际化
        'locale', 'locales', 'i18n',
        // 主题
        'theme', 'themes',
        // 模板
        'template', 'templates', 'partial', 'partials',
        // 容器
        'container', 'containers',
        // 架构层
        'presentation', 'presentations', 'domain', 'domains',
        'infrastructure', 'infrastructures', 'application', 'applications',
        // 核心
        'core', 'kernel', 'base', 'bases',
        // 内部和外部
        'internal', 'internals', 'external', 'externals',
        // 第三方
        'vendor', 'vendors',
        // 插件和扩展
        'plugin', 'plugins', 'extension', 'extensions',
        // 工具和脚本
        'tool', 'tools', 'script', 'scripts',
        // 构建输出
        'bin', 'build', 'dist', 'out',
        // 文档
        'doc', 'docs', 'documentation',
        // 示例
        'example', 'examples', 'demo', 'demos', 'sample', 'samples',
      ];
      
      // 检查 purpose 是否为纯职能描述
      // 如果 purpose 只包含职能关键词（如 "page"、"component"），则是纯职能
      // 如果包含其他词汇（如 "payment page"），则是业务性
      const isPureFunctional = pureFunctionalKeywords.some(keyword => {
        // 精确匹配或作为独立单词出现
        const regex = new RegExp(`^${keyword}$|\\b${keyword}\\b`, 'i');
        return regex.test(purpose);
      });
      
      // 如果 purpose 不是纯职能关键词，且包含其他描述性词汇，则认为是业务文件夹
      if (!isPureFunctional) {
        // 检查是否包含业务性描述（非职能关键词的其他词汇）
        // 如果 purpose 长度超过单个职能关键词，可能包含业务描述
        const purposeWords = purpose.split(/\s+/).filter((w: string) => w.length > 0);
        const hasNonFunctionalWords = purposeWords.some((word: string) => {
          // 检查单词是否不在职能关键词列表中
          return !pureFunctionalKeywords.some(keyword => 
            word === keyword || word.includes(keyword) || keyword.includes(word)
          );
        });
        
        if (hasNonFunctionalWords) {
          return true; // 包含业务性词汇
        }
      }
    }
    
    // 标准2: 同级下有其他带有业务性词汇的同类文件夹
    if (dir.parentDirectory) {
      const siblings = deepAnalysis.filter(d => 
        d.parentDirectory === dir.parentDirectory && d.path !== dir.path
      );
      
      // 检查同级目录是否都是业务性命名（非职能关键词）
      const siblingNames = siblings.map(s => path.basename(s.path).toLowerCase());
      const hasBusinessSiblings = siblings.some(sibling => {
        const siblingName = path.basename(sibling.path).toLowerCase();
        // 如果同级目录名不包含职能关键词，可能是业务文件夹
        const isFunctionalSibling = functionalFolderKeywords.some(keyword => 
          siblingName === keyword || siblingName.includes(keyword)
        );
        return !isFunctionalSibling;
      });
      
      // 如果当前目录名也不包含职能关键词，且同级有业务性文件夹，则认为是业务文件夹
      const dirName = path.basename(dir.path).toLowerCase();
      const isFunctionalName = functionalFolderKeywords.some(keyword => 
        dirName === keyword || dirName.includes(keyword)
      );
      
      if (!isFunctionalName && hasBusinessSiblings && siblings.length > 0) {
        return true;
      }
    }
    
    // 标准3: 无法识别类别或无法匹配职能关键词列表
    if (dir.category === 'other' || !dir.category) {
      const dirName = path.basename(dir.path).toLowerCase();
      const dirPath = dir.path.toLowerCase();
      const isFunctional = functionalFolderKeywords.some(keyword => 
        dirName === keyword || dirName.includes(keyword) ||
        dirPath.includes(`/${keyword}/`) || dirPath.includes(`/${keyword}`)
      );
      
      // 判断 purpose 是否为 "other" 或空（只判断英文，不判断中文）
      const purposeLower = (dir.purpose || '').toLowerCase();
      const isOtherPurpose = !dir.purpose || 
                            purposeLower === 'other' || 
                            purposeLower === 'unknown' ||
                            purposeLower === '';
      
      if (!isFunctional && isOtherPurpose) {
        return true;
      }
    }
    
    return false;
}

/**
 * 生成目录职能说明（精简版，只显示职能文件夹层，不显示详细的业务类页面和组件）
 */
function generateDirectoryPurposes(deepAnalysis: DeepDirectoryAnalysis[], projectFiles: string[]): string {
    if (deepAnalysis.length === 0) {
      return "Analyzing directory purposes...\n\n";
    }

    const functionalFolderKeywords = FUNCTIONAL_FOLDER_KEYWORDS;

    // 判断目录是否为职能文件夹（而非业务类页面/组件）
    const isFunctionalFolder = (dir: DeepDirectoryAnalysis): boolean => {
      const dirName = path.basename(dir.path).toLowerCase();
      const dirPath = dir.path.toLowerCase();
      
      // 检查目录名是否包含职能关键词
      const hasFunctionalKeyword = functionalFolderKeywords.some(keyword => 
        dirName === keyword || dirName.includes(keyword)
      );
      
      // 检查目录路径是否包含职能关键词
      const pathHasFunctionalKeyword = functionalFolderKeywords.some(keyword => 
        dirPath.includes(`/${keyword}/`) || dirPath.includes(`/${keyword}`)
      );
      
      // 如果目录有明确的职能说明（非业务相关），也认为是职能文件夹
      // 只判断英文，不判断中文
      const purposeLower = (dir.purpose || '').toLowerCase();
      const hasFunctionalPurpose = !!dir.purpose && 
        dir.purpose !== '' &&
        purposeLower !== 'other' &&
        purposeLower !== 'unknown' &&
        !isBusinessFolder(dir, deepAnalysis);
      
      return hasFunctionalKeyword || pathHasFunctionalKeyword || hasFunctionalPurpose;
    };

    // 按重要性排序：文件数量多的、深度浅的优先
    const sorted = [...deepAnalysis]
      .filter((d) => {
        // 只保留职能文件夹（过滤掉业务类页面和组件）
        if (!isFunctionalFolder(d)) return false;
        
        // 新增：过滤掉业务性文件夹
        if (isBusinessFolder(d, deepAnalysis)) return false;
        
        // 过滤掉无意义的目录（空目录且无子目录）
        if (d.fileCount === 0 && (!d.childDirectories || d.childDirectories.length === 0)) return false;
        // 保留有文件或子目录的目录
        return true;
      })
      .sort((a, b) => {
        // 先按深度排序（浅的优先，最多显示到第3层）
        if (a.depth !== b.depth) return a.depth - b.depth;
        // 再按文件数量排序（多的优先）
        if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
        // 最后按路径排序
        return a.path.localeCompare(b.path);
      });

    // 只显示关键目录（深度 <= 3 的职能文件夹）
    const keyDirectories = sorted.filter((d) => d.depth <= 3);
    
    let content = "";
    
    content += `> 💡 See @code-style.mdc for naming conventions and code style\n\n`;

    for (const dir of keyDirectories) {
      content += `### \`${dir.path}/\`\n\n`;
      content += `**Purpose**: ${dir.purpose || 'Unidentified'}\n\n`;

      // Sample files: pick up to 3 direct children (excluding index/dotfiles) to add
      // concrete context beyond the directory name
      const dirPrefix = dir.path.endsWith("/") ? dir.path : dir.path + "/";
      const sampleFiles = projectFiles
        .filter((f) => {
          if (!f.startsWith(dirPrefix)) return false;
          const rest = f.slice(dirPrefix.length);
          return !rest.includes("/") && !rest.startsWith(".") && !rest.startsWith("index.");
        })
        .map((f) => path.basename(f))
        .slice(0, 3);
      if (sampleFiles.length > 0) {
        content += `- Sample files: ${sampleFiles.map((f) => `\`${f}\``).join(", ")}\n`;
      }

      // 只保留真正有价值的信息
      
      // 1. 使用 index 文件（影响文件组织方式）
      if (dir.hasIndexFiles) {
        content += `- Uses index files for exports\n`;
      }
      
      // 2. 架构模式（影响代码组织）
      if (dir.architecturePattern) {
        content += `- Architecture pattern: ${dir.architecturePattern}\n`;
      }
      
      // 3. 子目录（只显示职能子目录，不显示业务子目录）
      if (dir.childDirectories && dir.childDirectories.length > 0) {
        const functionalChildren = dir.childDirectories.filter((c: string) => {
          const childDir = deepAnalysis.find((d) => d.path === c);
          return childDir && 
                 isFunctionalFolder(childDir) && 
                 !isBusinessFolder(childDir, deepAnalysis); // 新增：过滤业务文件夹
        });
        
        if (functionalChildren.length > 0) {
          const childCount = functionalChildren.length;
          const displayChildren = functionalChildren.slice(0, 5);
          content += `- Functional subdirectories (${childCount}): ${displayChildren.map((c: string) => {
          const childName = c.split("/").pop() || c;
          return `\`${childName}\``;
        }).join(", ")}`;
        if (childCount > 5) {
          content += ` ...`;
        }
        content += `\n`;
        }
      }
      
      content += `\n`;
      }
      
    // 添加深层目录的简要说明
    const deepDirectories = sorted.filter((d) => d.depth > 3);
    if (deepDirectories.length > 0) {
      content += `\n**Other deep functional directories** (${deepDirectories.length}): See the directory tree above for the full structure.\n\n`;
    }

    return content;
}

/**
 * 生成文件组织规则
 */
function generateFileOrganizationRules(
  context: RuleGenerationContext
): string {
    if (!context.fileOrganization) {
      return "File organization guidelines pending.\n";
    }

    const org = context.fileOrganization;
    let content = "";

    // 组件位置
    if (org.componentLocation.length > 0) {
      content += `### Components\n\n`;
      content += `**Location**: \`${org.componentLocation[0]}/\`\n\n`;
      if (org.namingConvention.components) {
        content += `**Naming conventions**: ${org.namingConvention.components}\n\n`;
      }
      content += `\n`;
    }

    // 工具函数位置
    if (org.utilsLocation.length > 0) {
      content += `### Utilities\n\n`;
      content += `**Location**: \`${org.utilsLocation[0]}/\`\n\n`;
      content += `**Organization**: Group by concern (e.g. \`date.ts\`, \`validation.ts\`)\n\n`;
    }

    // 类型定义位置
    if (org.typesLocation && org.typesLocation.length > 0) {
      content += `### Type Definitions\n\n`;
      content += `**Location**: \`${org.typesLocation[0]}/\`\n\n`;
    }

    // 样式目录：只在 basename 属于样式根目录语义词时展示
    // 深度本身不是判据，命名才是（styles/theme/tokens 是根；Funding/FormModule 是业务路径）
    const STYLE_ROOT_KEYWORDS = new Set([
      'styles', 'style', 'css', 'scss', 'less', 'sass',
      'theme', 'themes', 'tokens', 'stylesheets', 'assets',
    ]);
    if (org.stylesLocation && org.stylesLocation.length > 0) {
      const styleRootDir = org.stylesLocation.find((loc) => {
        const basename = loc.replace(/\/$/, '').split('/').pop() ?? '';
        return STYLE_ROOT_KEYWORDS.has(basename.toLowerCase());
      });
      if (styleRootDir) {
        content += `### Styles\n\n`;
        content += `**Location**: \`${styleRootDir}/\`\n\n`;
      }
    }

    // API 位置
    if (org.apiLocation && org.apiLocation.length > 0) {
      content += `### API\n\n`;
      content += `**Location**: \`${org.apiLocation[0]}/\`\n\n`;
    }

    // Hooks 位置
    if (org.hooksLocation && org.hooksLocation.length > 0) {
      content += `### Hooks\n\n`;
      content += `**Location**: \`${org.hooksLocation[0]}/\`\n\n`;
    }

    return content;
}

/**
 * 生成新建文件指南
 */
function generateNewFileGuidelines(
  context: RuleGenerationContext
): string {
    const org = context.fileOrganization;
    const isTS = context.techStack.languages.includes("TypeScript");
    const ext = isTS ? "ts" : "js";
    const extx = isTS ? "tsx" : "jsx";
    const isFrontend = isFrontendProject(context);

    let content = `### File Location Decision Table\n\n`;
    content += `> When creating a new file, use this table to find the correct directory; if unsure, follow a similar existing file.\n\n`;
    content += `| File type | Location | Example filename |\n`;
    content += `|-----------|----------|------------------|\n`;

    if (org) {
      if (isFrontend) {
        // 页面/路由组件 与 可复用 UI 组件 语义不同，必须分别检测目录
        // 优先从 deepAnalysis 检测 views/pages/screens/routes 目录（取最浅路径）
        const PAGE_DIR_KEYWORDS = new Set(['views', 'pages', 'screens', 'routes']);
        const pageDir = (context.deepAnalysis ?? [])
          .filter(d => PAGE_DIR_KEYWORDS.has(d.path.split('/').pop()?.toLowerCase() ?? ''))
          .sort((a, b) => a.depth - b.depth)[0]?.path;

        if (pageDir && org.componentLocation.length > 0 && pageDir !== org.componentLocation[0]) {
          // 有独立页面目录 → 分别映射
          content += `| Page component | \`${pageDir}/\` | \`UserList.${extx}\` |\n`;
          content += `| Reusable UI component | \`${org.componentLocation[0]}/\` | \`Button.${extx}\` |\n`;
        } else if (pageDir) {
          content += `| Page / reusable component | \`${pageDir}/\` | \`UserList.${extx}\` |\n`;
        } else if (org.componentLocation.length > 0) {
          // 无独立页面目录，组件目录兼用于页面
          content += `| Component (incl. pages) | \`${org.componentLocation[0]}/\` | \`UserList.${extx}\` |\n`;
        }
      }
      if (org.utilsLocation.length > 0) {
        const loc = org.utilsLocation[0];
        content += `| Utility function | \`${loc}/\` | \`format.${ext}\`, \`validate.${ext}\` |\n`;
      }
      if (org.hooksLocation && org.hooksLocation.length > 0) {
        const loc = org.hooksLocation[0];
        content += `| Custom hook | \`${loc}/\` | \`useXxx.${ext}\` |\n`;
      }
      if (org.typesLocation && org.typesLocation.length > 0) {
        const loc = org.typesLocation[0];
        content += `| Type definition | \`${loc}/\` | \`user.types.${ext}\` |\n`;
      }
      if (org.apiLocation && org.apiLocation.length > 0) {
        const loc = org.apiLocation[0];
        content += `| API / Service | \`${loc}/\` | \`user.api.${ext}\` |\n`;
      }
    }
    content += `\n`;

    if (isFrontend && org?.namingConvention?.useIndexFiles) {
      content += `### Component Directory Layout\n\n`;
      const compLoc = org.componentLocation[0] || 'src/components';
      content += `\`\`\`\n`;
      content += `${compLoc}/ComponentName/\n`;
      content += `  ├── index.${extx}       # Export entry\n`;
      content += `  ├── ComponentName.${extx} # Implementation\n`;
      content += `  └── ComponentName.test.${ext} # Test file\n`;
      content += `\`\`\`\n\n`;
    }

    if (
      context.projectConfig?.pathAliases &&
      Object.keys(context.projectConfig.pathAliases).length > 0
    ) {
      const aliases = Object.keys(context.projectConfig.pathAliases);
      content += `### Import Path Aliases\n\n`;
      content += `Use aliases instead of relative paths: ${aliases.map(a => `\`${a}\``).join(", ")}\n\n`;
    }

    return content;
}

/**
 * 评估深度分析数据的质量
 */
function assessDeepAnalysisQuality(
  deepAnalysis: DeepDirectoryAnalysis[] | undefined
): {
  isIncomplete: boolean;
  reason: string;
  quality: "good" | "fair" | "poor" | "missing";
} {
    if (!deepAnalysis || deepAnalysis.length === 0) {
      return {
        isIncomplete: true,
        reason: "No directory analysis data retrieved",
        quality: "missing",
      };
    }

    // 检查是否有根目录（depth === 1）
    const rootDirs = deepAnalysis.filter((d) => d.depth === 1);
    if (rootDirs.length === 0) {
      return {
        isIncomplete: true,
        reason: "Missing root directory analysis data",
        quality: "poor",
      };
    }

    // 检查是否有层级关系（parentDirectory）
    const hasHierarchy = deepAnalysis.some((d) => d.parentDirectory);
    if (!hasHierarchy && deepAnalysis.length > rootDirs.length) {
      return {
        isIncomplete: true,
        reason: "Directory hierarchy relationships incomplete",
        quality: "fair",
      };
    }

    // 检查职能识别的完整性（是否有大量"其他"分类）
    const otherCount = deepAnalysis.filter(
      (d) => {
        // 只判断英文，不判断中文
        const purposeLower = (d.purpose || '').toLowerCase();
        return purposeLower === 'other' || purposeLower === 'unknown' || d.category === "other";
      }
    ).length;
    const otherRatio = otherCount / deepAnalysis.length;

    if (otherRatio > 0.5) {
      return {
        isIncomplete: true,
        reason: `Purpose unidentified for over ${Math.round(otherRatio * 100)}% of directories`,
        quality: "fair",
      };
    }

    // 数据质量良好
    return {
      isIncomplete: false,
      reason: "",
      quality: "good",
    };
}
