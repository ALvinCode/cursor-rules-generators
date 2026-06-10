import * as path from "path";
import { DeepDirectoryAnalysis, Module } from "../../types.js";
import { logger } from "../../utils/logger.js";

/**
 * 模块结构分析结果
 */
export interface ModuleStructureAnalysis {
  directoryTree: string; // 目录树文本
  mainDirectories: Array<{
    path: string;
    purpose: string;
    category: string;
    fileCount: number;
    fileTypes: string[];
    namingPattern: string;
    hasIndexFiles: boolean;
    coLocationPattern?: {
      styles: boolean;
      tests: boolean;
      types: boolean;
    };
  }>;
  fileOrganizationPattern: {
    usesCoLocation: boolean;
    usesIndexFiles: boolean;
    primaryNamingPattern: string;
  };
}

/**
 * 模块结构分析器
 * 分析模块的目录结构、文件组织模式等
 */
export class ModuleStructureAnalyzer {
  /**
   * 分析模块结构
   */
  analyzeModuleStructure(
    module: Module,
    deepAnalysis: DeepDirectoryAnalysis[],
    projectPath: string
  ): ModuleStructureAnalysis {
    // 过滤出属于该模块的目录
    const moduleDirectories = this.filterModuleDirectories(
      module,
      deepAnalysis,
      projectPath
    );

    if (moduleDirectories.length === 0) {
      return {
        directoryTree: "```text\n模块目录结构分析中...\n```\n\n",
        mainDirectories: [],
        fileOrganizationPattern: {
          usesCoLocation: false,
          usesIndexFiles: false,
          primaryNamingPattern: "mixed",
        },
      };
    }

    // 生成目录树
    const directoryTree = this.generateModuleDirectoryTree(
      moduleDirectories,
      module.path
    );

    // 识别主要目录
    const mainDirectories = this.identifyMainDirectories(moduleDirectories);

    // 分析文件组织模式
    const fileOrganizationPattern = this.analyzeFileOrganizationPattern(
      moduleDirectories
    );

    return {
      directoryTree,
      mainDirectories,
      fileOrganizationPattern,
    };
  }

  /**
   * 过滤出属于该模块的目录
   */
  private filterModuleDirectories(
    module: Module,
    deepAnalysis: DeepDirectoryAnalysis[],
    projectPath: string
  ): DeepDirectoryAnalysis[] {
    const modulePath = path.resolve(module.path);
    const normalizedModulePath = modulePath.replace(/\\/g, "/").toLowerCase();

    return deepAnalysis.filter((analysis) => {
      const analysisPath = path.resolve(analysis.path).replace(/\\/g, "/").toLowerCase();
      
      // 方法1: 如果 analysis 有 module 字段，直接匹配
      if (analysis.module) {
        return analysis.module === module.name || analysis.module === path.basename(module.path);
      }

      // 方法2: 检查路径是否在模块路径下
      if (analysisPath.startsWith(normalizedModulePath)) {
        // 确保是模块目录或其子目录，而不是父目录
        const relativePath = analysisPath.slice(normalizedModulePath.length);
        // 排除空字符串（模块本身）或不是以 / 开头的路径（可能是父目录）
        return relativePath === "" || relativePath.startsWith("/");
      }

      return false;
    });
  }

  /**
   * 生成模块目录树
   */
  private generateModuleDirectoryTree(
    moduleDirectories: DeepDirectoryAnalysis[],
    modulePath: string
  ): string {
    if (moduleDirectories.length === 0) {
      return "```text\n模块目录结构分析中...\n```\n\n";
    }

    // 计算相对于模块路径的深度
    const normalizedModulePath = path.resolve(modulePath).replace(/\\/g, "/");
    const moduleDepth = normalizedModulePath.split("/").filter(Boolean).length;

    // 调整深度，使模块根目录的深度为 1
    const adjustedDirectories = moduleDirectories.map((dir) => {
      const adjustedDepth = dir.depth - moduleDepth + 1;
      return { ...dir, adjustedDepth };
    });

    // 找到模块根目录（adjustedDepth === 1）
    const rootDirs = adjustedDirectories.filter((d) => d.adjustedDepth === 1);

    // 如果没有根目录，使用深度最小的目录
    const effectiveRootDirs =
      rootDirs.length > 0
        ? rootDirs
        : adjustedDirectories.filter(
            (d) =>
              d.adjustedDepth ===
              Math.min(...adjustedDirectories.map((d) => d.adjustedDepth))
          );

    // 按名称排序
    effectiveRootDirs.sort((a, b) => {
      const aName = path.basename(a.path);
      const bName = path.basename(b.path);
      return aName.localeCompare(bName);
    });

    const tree: string[] = [];

    type AdjustedDir = DeepDirectoryAnalysis & { adjustedDepth: number };
    const buildTree = (
      dir: AdjustedDir,
      prefix: string,
      isLast: boolean,
      allDirs: AdjustedDir[]
    ) => {
      const connector = isLast ? "└── " : "├── ";
      const dirName = path.basename(dir.path);
      // 只判断英文，不判断中文
      const purposeLower = (dir.purpose || '').toLowerCase();
      const hasValidPurpose = dir.purpose && 
                              dir.purpose !== "" && 
                              purposeLower !== 'other' && 
                              purposeLower !== 'unknown';
      const purpose = hasValidPurpose ? ` # ${dir.purpose}` : "";

      tree.push(`${prefix}${connector}${dirName}/${purpose}`);

      // 找到所有子目录
      const children = allDirs.filter((d) => {
        if (d.adjustedDepth !== dir.adjustedDepth + 1) return false;
        const parentPath = path.dirname(d.path).replace(/\\/g, "/");
        const dirPath = dir.path.replace(/\\/g, "/");
        return parentPath === dirPath;
      });

      // 按名称排序
      children.sort((a, b) => {
        const aName = path.basename(a.path);
        const bName = path.basename(b.path);
        return aName.localeCompare(bName);
      });

      // 递归构建子树
      children.forEach((child, index) => {
        const isLastChild = index === children.length - 1;
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        buildTree(child, childPrefix, isLastChild, allDirs);
      });
    };

    // 构建所有根目录的树
    effectiveRootDirs.forEach((dir, index) => {
      buildTree(dir, "", index === effectiveRootDirs.length - 1, adjustedDirectories);
    });

    return `\`\`\`text\n${tree.join("\n")}\n\`\`\`\n\n`;
  }

  /**
   * 识别主要目录
   */
  private identifyMainDirectories(
    moduleDirectories: DeepDirectoryAnalysis[]
  ): ModuleStructureAnalysis["mainDirectories"] {
    // 按重要性排序：文件数量多的、深度浅的优先
    const sorted = [...moduleDirectories]
      .filter((d) => {
        // 过滤掉无意义的目录
        if (d.fileCount === 0 && (!d.childDirectories || d.childDirectories.length === 0))
          return false;
        return true;
      })
      .sort((a, b) => {
        // 先按深度排序（浅的优先）
        if (a.depth !== b.depth) return a.depth - b.depth;
        // 再按文件数量排序（多的优先）
        if (b.fileCount !== a.fileCount) return b.fileCount - a.fileCount;
        return a.path.localeCompare(b.path);
      });

    // 只显示关键目录（深度 <= 3 的目录，或文件数量 > 5 的目录）
    const keyDirectories = sorted.filter(
      (d) => d.depth <= 3 || d.fileCount > 5
    );

    return keyDirectories.slice(0, 20).map((dir) => ({
      path: dir.path,
      purpose: dir.purpose || "other",
      category: dir.category || "其他",
      fileCount: dir.fileCount,
      fileTypes: dir.primaryFileTypes || [],
      namingPattern: dir.namingPattern || "mixed",
      hasIndexFiles: dir.hasIndexFiles || false,
      coLocationPattern: dir.coLocationPattern,
    }));
  }

  /**
   * 分析文件组织模式
   */
  private analyzeFileOrganizationPattern(
    moduleDirectories: DeepDirectoryAnalysis[]
  ): ModuleStructureAnalysis["fileOrganizationPattern"] {
    let usesCoLocation = false;
    let usesIndexFiles = false;
    const namingPatterns: Record<string, number> = {};

    for (const dir of moduleDirectories) {
      if (dir.coLocationPattern) {
        if (
          dir.coLocationPattern.styles ||
          dir.coLocationPattern.tests ||
          dir.coLocationPattern.types
        ) {
          usesCoLocation = true;
        }
      }

      if (dir.hasIndexFiles) {
        usesIndexFiles = true;
      }

      if (dir.namingPattern) {
        namingPatterns[dir.namingPattern] =
          (namingPatterns[dir.namingPattern] || 0) + 1;
      }
    }

    // 找出最常见的命名模式
    const primaryNamingPattern =
      Object.keys(namingPatterns).length > 0
        ? Object.entries(namingPatterns).sort((a, b) => b[1] - a[1])[0][0]
        : "mixed";

    return {
      usesCoLocation,
      usesIndexFiles,
      primaryNamingPattern,
    };
  }
}

