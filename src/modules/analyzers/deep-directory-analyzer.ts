import * as path from "path";
import {
  DeepDirectoryAnalysis,
  FileTypeCategory,
  FileTypeInfo,
  ArchitecturePattern,
  Dependency,
} from '../../types.js';
import { FileUtils } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";
import { FileTypeIdentifier } from './file-type-identifier.js';
import { DependencyAnalyzer } from './dependency-analyzer.js';
import { FileContentAnalyzer } from './file-content-analyzer.js';

/**
 * 深度目录分析器
 * 系统且完整地分析目标项目结构，了解每个文件夹的职能和作用
 */
export class DeepDirectoryAnalyzer {
  private fileTypeIdentifier: FileTypeIdentifier;
  private dependencyAnalyzer: DependencyAnalyzer;
  private fileContentAnalyzer: FileContentAnalyzer;
  private dependencies: Dependency[] = [];

  constructor() {
    this.fileTypeIdentifier = new FileTypeIdentifier();
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.fileContentAnalyzer = new FileContentAnalyzer();
  }

  /**
   * 设置依赖信息（需要在分析前调用）
   */
  async setDependencies(dependencies: Dependency[]): Promise<void> {
    this.dependencies = dependencies;
    await this.dependencyAnalyzer.initialize("", dependencies);
  }

  /**
   * 深度分析项目目录结构
   */
  async analyzeProjectStructure(
    projectPath: string,
    files: string[],
    modules: Array<{ name: string; path: string }>,
    dependencies?: Dependency[]
  ): Promise<DeepDirectoryAnalysis[]> {
    // 如果提供了依赖信息，先初始化
    if (dependencies && dependencies.length > 0) {
      await this.setDependencies(dependencies);
    }
    
    // 0. 构建目录树结构（用于上下文分析）
    const directoryTree = this.buildDirectoryTree(files, projectPath);

    // 0.b. 预计算文件→目录索引：避免在 analyzeDirectory 中对每个目录都全量扫描 files。
    // dirToDirectFiles[d] 仅包含直接位于 d 下（不含子目录）的文件，
    // analyzeDirectory 内再合并子目录列表获得递归文件集合。
    const dirToDirectFiles = new Map<string, string[]>();
    for (const f of files) {
      const rel = FileUtils.getRelativePath(projectPath, f);
      const dir = path.dirname(rel);
      const bucket = dirToDirectFiles.get(dir);
      if (bucket) {
        bucket.push(f);
      } else {
        dirToDirectFiles.set(dir, [f]);
      }
    }

    // 1. 识别所有文件类型
    const fileTypeMap = await this.fileTypeIdentifier.identifyFileTypes(
      files,
      projectPath
    );

    // 2. 提取所有目录
    const directories = this.extractAllDirectories(projectPath, files);

    // 2.b. 预构建 parent→children 邻接表：供 analyzeDirectory 合并子文件时
    // 从 O(全部 map keys) 降为 O(直接子目录数)。
    const dirChildren = new Map<string, string[]>();
    for (const d of dirToDirectFiles.keys()) {
      const parent = path.dirname(d);
      if (parent === d) continue;
      const siblings = dirChildren.get(parent);
      if (siblings) {
        siblings.push(d);
      } else {
        dirChildren.set(parent, [d]);
      }
    }

    // 3. 分批并行分析目录（每批 8 个，避免文件句柄耗尽）
    const BATCH_SIZE = 8;
    const analyses: DeepDirectoryAnalysis[] = [];
    const dirArray = [...directories];

    for (let i = 0; i < dirArray.length; i += BATCH_SIZE) {
      const batch = dirArray.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (dir) => {
          try {
            return await this.analyzeDirectory(
              dir,
              projectPath,
              files,
              fileTypeMap,
              modules,
              directoryTree,
              dirToDirectFiles,
              dirChildren
            );
          } catch (error) {
            logger.debug(`分析目录失败: ${dir}`, error);
            return null;
          }
        }),
      );
      for (const r of results) {
        if (r) analyses.push(r);
      }
    }

    // 4. 建立目录层级关系
    this.buildDirectoryHierarchy(analyses);

    return analyses;
  }

  /**
   * 分析单个目录
   */
  private async analyzeDirectory(
    dirPath: string,
    projectPath: string,
    allFiles: string[],
    fileTypeMap: Map<string, FileTypeInfo>,
    modules: Array<{ name: string; path: string }>,
    directoryTree: Map<string, string[]>,
    dirToDirectFiles?: Map<string, string[]>,
    dirChildren?: Map<string, string[]>
  ): Promise<DeepDirectoryAnalysis | null> {
    const fullPath = path.join(projectPath, dirPath);
    let filesInDir: string[];
    let directFiles: string[];

    if (dirToDirectFiles) {
      directFiles = dirToDirectFiles.get(dirPath) ?? [];
      filesInDir = [...directFiles];

      if (dirChildren) {
        // O(children)：通过邻接表递归收集子目录文件
        const collectDescendants = (parent: string): void => {
          const children = dirChildren.get(parent);
          if (!children) return;
          for (const child of children) {
            const childFiles = dirToDirectFiles.get(child);
            if (childFiles) filesInDir.push(...childFiles);
            collectDescendants(child);
          }
        };
        collectDescendants(dirPath);
      } else {
        // 旧路径：O(全部 map keys) 前缀匹配
        const prefix = dirPath + path.sep;
        for (const [childDir, childFiles] of dirToDirectFiles) {
          if (childDir !== dirPath && childDir.startsWith(prefix)) {
            filesInDir.push(...childFiles);
          }
        }
      }
    } else {
      filesInDir = allFiles.filter((f) => {
        const fileDir = path.dirname(FileUtils.getRelativePath(projectPath, f));
        return fileDir === dirPath || fileDir.startsWith(dirPath + path.sep);
      });
      directFiles = filesInDir.filter((f) => {
        const fileDir = path.dirname(FileUtils.getRelativePath(projectPath, f));
        return fileDir === dirPath;
      });
    }

    if (directFiles.length === 0 && filesInDir.length === 0) {
      return null; // 空目录或只有子目录
    }

    // 分析文件类型分布
    const fileTypeDistribution = this.analyzeFileTypeDistribution(
      directFiles,
      fileTypeMap
    );

    // 识别主要文件类型
    const primaryFileTypes = this.getPrimaryFileTypes(fileTypeDistribution);

    // 获取同级目录列表（用于上下文分析）
    const siblingDirs = this.getSiblingDirectories(dirPath, directoryTree);
    
    // 识别目录用途（使用新的五阶段逻辑）
    const purpose = await this.inferDirectoryPurposeEnhanced(
      dirPath,
      directFiles,
      fileTypeDistribution,
      primaryFileTypes,
      projectPath,
      siblingDirs
    );

    // 识别目录分类
    const category = this.inferDirectoryCategory(dirPath, purpose, primaryFileTypes);

    // 检测命名模式
    const namingPattern = this.detectNamingPattern(directFiles);

    // 检测架构模式
    const architecturePattern = this.detectArchitecturePattern(
      dirPath,
      directFiles,
      fileTypeDistribution
    );

    // 检测 co-location 模式
    const coLocationPattern = this.detectCoLocationPattern(directFiles, fileTypeMap);

    // 检测 index 文件
    const hasIndexFiles = directFiles.some((f) => {
      const name = path.basename(f);
      return name.startsWith("index.") || name === "index";
    });

    // 计算目录深度
    const depth = dirPath.split(path.sep).filter(Boolean).length;

    // 识别所属模块
    const module = this.identifyModule(dirPath, modules);

    // 识别版本标识
    const version = this.identifyVersion(dirPath, directFiles);

    // 识别子目录
    const childDirectories = this.getChildDirectories(
      dirPath,
      allFiles,
      projectPath,
      dirToDirectFiles
    );

    return {
      path: dirPath,
      purpose,
      category,
      fileTypeDistribution,
      primaryFileTypes,
      namingPattern,
      architecturePattern,
      hasIndexFiles,
      coLocationPattern,
      fileCount: directFiles.length,
      depth,
      module,
      version,
      childDirectories,
    };
  }

  /**
   * 提取所有目录
   */
  private extractAllDirectories(
    projectPath: string,
    files: string[]
  ): Set<string> {
    const directories = new Set<string>();

    for (const file of files) {
      const relativePath = FileUtils.getRelativePath(projectPath, file);
      const dir = path.dirname(relativePath);

      if (dir && dir !== ".") {
        // 添加所有父目录
        const parts = dir.split(path.sep).filter(Boolean);
        let current = "";
        for (const part of parts) {
          current = current ? path.join(current, part) : part;
          directories.add(current);
        }
      }
    }

    return directories;
  }

  /**
   * 分析文件类型分布
   */
  private analyzeFileTypeDistribution(
    files: string[],
    fileTypeMap: Map<string, FileTypeInfo>
  ): Record<FileTypeCategory, number> {
    const distribution: Record<FileTypeCategory, number> = {
      page: 0,
      component: 0,
      hook: 0,
      utility: 0,
      service: 0,
      type: 0,
      enum: 0,
      constant: 0,
      config: 0,
      test: 0,
      style: 0,
      layout: 0,
      middleware: 0,
      model: 0,
      repository: 0,
      controller: 0,
      route: 0,
      other: 0,
    };

    for (const file of files) {
      const typeInfo = fileTypeMap.get(file);
      if (typeInfo) {
        distribution[typeInfo.category] =
          (distribution[typeInfo.category] || 0) + 1;
      } else {
        distribution.other += 1;
      }
    }

    return distribution;
  }

  /**
   * 获取主要文件类型（占比 > 20%）
   */
  private getPrimaryFileTypes(
    distribution: Record<FileTypeCategory, number>
  ): FileTypeCategory[] {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    const threshold = total * 0.2; // 20% 阈值

    return Object.entries(distribution)
      .filter(([_, count]) => count >= threshold)
      .sort(([_, a], [__, b]) => b - a)
      .map(([category]) => category as FileTypeCategory);
  }

  /**
   * 推断目录用途（五阶段增强版）
   * 遵循：依赖关联 -> 类别语义 -> 业务语义 -> 父级继承 -> 文件内容分析
   */
  /**
   * 构建目录树结构
   */
  private buildDirectoryTree(
    files: string[],
    projectPath: string
  ): Map<string, string[]> {
    const tree = new Map<string, string[]>();
    
    for (const file of files) {
      const relativePath = file.replace(projectPath + path.sep, "");
      const dirPath = path.dirname(relativePath);
      const dirParts = dirPath.split(path.sep).filter(Boolean);
      
      // 构建每一层目录的父级关系
      for (let i = 0; i < dirParts.length; i++) {
        const currentDir = dirParts.slice(0, i + 1).join(path.sep);
        const parentDir = i > 0 ? dirParts.slice(0, i).join(path.sep) : "";
        
        if (!tree.has(parentDir)) {
          tree.set(parentDir, []);
        }
        
        const siblings = tree.get(parentDir)!;
        if (!siblings.includes(currentDir)) {
          siblings.push(currentDir);
        }
      }
    }
    
    return tree;
  }

  /**
   * 获取同级目录列表
   */
  private getSiblingDirectories(
    dirPath: string,
    directoryTree: Map<string, string[]>
  ): string[] {
    // 获取父级目录路径
    const parentPath = path.dirname(dirPath);
    const currentDirName = path.basename(dirPath);
    
    // 从目录树中获取同级目录
    const siblings = directoryTree.get(parentPath) || [];
    
    // 提取同级目录的名称（排除当前目录）
    const siblingNames = siblings
      .map((sibling) => path.basename(sibling))
      .filter((name) => name !== currentDirName);
    
    return siblingNames;
  }

  /**
   * 分析同级目录模式，识别项目文件夹
   */
  private analyzeSiblingPattern(siblingDirs: string[]): {
    isProjectPattern: boolean;
    pattern?: string;
  } {
    if (siblingDirs.length < 2) {
      return { isProjectPattern: false };
    }

    // 检查是否有国家代码模式（如 -id, -my, -ph, -sg, -th, -tw, -vn, -hk, -jp）
    // 优先检查国家代码，因为这是最明显的项目模式
    const countryCodes = ["id", "my", "ph", "sg", "th", "tw", "vn", "hk", "jp", "cn"];
    const countryCodeMatches = siblingDirs.filter((dir) =>
      countryCodes.some((code) => dir.toLowerCase().endsWith(`-${code}`))
    );

    // 如果有超过 50% 的目录以国家代码结尾，认为是项目模式
    if (countryCodeMatches.length >= siblingDirs.length * 0.5) {
      return { isProjectPattern: true, pattern: "country-based" };
    }

    // 检查是否有相似命名模式
    // 例如：gateway-web-hk, gateway-web-id, gateway-web-my 等
    const patterns: string[] = [];
    
    for (const dir of siblingDirs) {
      // 提取可能的模式前缀（如 gateway-web-）
      // 匹配至少包含一个连字符的模式
      const match = dir.match(/^([a-z]+(?:-[a-z]+)+)-/);
      if (match) {
        patterns.push(match[1]);
      }
    }

    // 如果超过 50% 的目录有相同前缀，认为是项目模式
    if (patterns.length >= siblingDirs.length * 0.5) {
      const patternCounts = new Map<string, number>();
      for (const pattern of patterns) {
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
      }

      for (const [pattern, count] of patternCounts) {
        if (count >= siblingDirs.length * 0.5) {
          return { isProjectPattern: true, pattern };
        }
      }
    }

    // 检查是否有连字符模式（至少2个目录包含连字符）
    const hyphenPatternMatches = siblingDirs.filter((dir) => /-/.test(dir));
    if (hyphenPatternMatches.length >= 2 && hyphenPatternMatches.length >= siblingDirs.length * 0.5) {
      return { isProjectPattern: true, pattern: "hyphen-based" };
    }

    return { isProjectPattern: false };
  }

  private async inferDirectoryPurposeEnhanced(
    dirPath: string,
    files: string[],
    distribution: Record<FileTypeCategory, number>,
    primaryTypes: FileTypeCategory[],
    projectPath: string,
    siblingDirs: string[] = []
  ): Promise<string> {
    const dirName = path.basename(dirPath).toLowerCase();
    const dirParts = dirPath.split(path.sep).filter(Boolean);
    const parentDir = dirParts.length >= 2 ? dirParts[dirParts.length - 2] : null;

    // ========== 如果目录名本身就是明确的类别词，优先识别（在容器目录检查之前） ==========
    const directCategory = this.getCategoryName(dirName);
    if (directCategory) {
      return directCategory;
    }

    // ========== 容器目录处理（不进行职能分析，但仍保留在目录树中） ==========
    // v1.9: app、source 等容器目录不标识职能，但文件夹结构要分析
    // 注意：src 和 lib 不在此列表中，它们会进行正常的职能分析
    const containerDirs = ["source", "sources", "app", "apps"];
    if (containerDirs.includes(dirName)) {
      return ""; // 返回空字符串，表示不标识职能
    }

    // ========== 特殊路径处理 ==========
    const normalizedPath = dirPath.toLowerCase();
    
    // 处理 proto 目录或包含 proto 的目录名
    if (dirName === "proto" || dirName === "protos" || dirName.includes("proto")) {
      // 检查是否包含 .proto 文件
      const hasProtoFiles = files.some((f) => f.toLowerCase().endsWith(".proto"));
      if (hasProtoFiles || dirName === "proto" || dirName === "protos") {
        return "协议定义";
      }
    }
    
    // 处理 __mocks__ 或 mocks 目录
    if (dirName === "__mocks__" || dirName === "mocks" || dirName === "mock") {
      return "Mock 数据";
    }
    
    // 处理 public/js 或 public/javascript
    if (normalizedPath.includes("/public/js") || normalizedPath.includes("/public/javascript")) {
      return "JavaScript 文件";
    }
    
    // 处理 public/assets 或 public/static
    if (normalizedPath.includes("/public/assets") || normalizedPath.includes("/public/static")) {
      return "资源文件";
    }
    if (normalizedPath.includes("/assets/") && normalizedPath.includes("/public/")) {
      return "资源文件";
    }

    // ========== 第一阶段：依赖关联判断（最高优先级） ==========
    if (this.dependencies.length > 0) {
      // 先进行简单匹配（不需要文件内容分析）
      const depRelationSimple = await this.dependencyAnalyzer.checkDependencyRelationSimple(
        dirPath,
        files
      );

      if (depRelationSimple.isRelated && depRelationSimple.purpose) {
        // 如果简单匹配成功，再进行文件内容二次确认（可选，提高准确性）
        const depRelation = await this.dependencyAnalyzer.checkDependencyRelation(
          dirPath,
          files,
          projectPath
        );

        if (depRelation.isRelated && depRelation.purpose) {
          logger.debug(`目录 ${dirPath} 与依赖 ${depRelation.dependencyName} 相关`);
          return depRelation.purpose;
        } else if (depRelationSimple.purpose) {
          // 即使文件内容确认失败，如果目录名匹配，也认为相关
          logger.debug(`目录 ${dirPath} 与依赖 ${depRelationSimple.dependencyName} 相关（基于目录名）`);
          return depRelationSimple.purpose;
        }
      }
    }

    // ========== 第二阶段：文件夹名称的类别语义判断 ==========
    const categoryPurpose = this.inferByCategoryName(dirName, dirPath);
    if (categoryPurpose) {
      // 向上查找类别词（忽略无意义命名）
      const categoryDir = this.findCategoryDirInAncestors(dirParts);
      if (categoryDir && categoryDir !== dirName) {
        return this.enhanceWithParentCategory(categoryPurpose, dirName, categoryDir);
      }
      return categoryPurpose;
    }

    // ========== 第三阶段：业务语义或不明语义的目录 ==========
    // 优先检查同级目录模式（项目文件夹识别）
    // 在文件内容分析之前检查，避免业务关键词干扰
    if (siblingDirs.length >= 2) {
      const siblingPattern = this.analyzeSiblingPattern(siblingDirs);
      if (siblingPattern.isProjectPattern) {
        // 如果是项目模式，直接返回，不进行文件内容分析
        return `${dirName} 项目`;
      }
    }
    
    // 如果当前目录是 src，完全跳过，使用父级目录名
    if (dirName === "src") {
      // 向上查找，跳过所有无意义命名
      for (let i = dirParts.length - 2; i >= 0; i--) {
        const ancestorDir = dirParts[i].toLowerCase();
        if (!this.isMeaninglessName(ancestorDir) && !this.isCategoryName(ancestorDir)) {
          // 使用父级目录名 + 根据文件类型推断的职能词
          const functionWord = this.getFunctionWordByFileTypes(primaryTypes);
          if (functionWord) {
            return `${ancestorDir} ${functionWord}`;
          }
          return ancestorDir;
        }
      }
      // 如果找不到有意义的父级目录，返回空字符串，让后续逻辑处理
    }
    
    // 如果目录名本身有意义（不是通用词），优先使用目录名而不是业务关键词
    // 先检查目录名是否可以直接使用
    if (!this.isCategoryName(dirName) && !this.isMeaninglessName(dirName)) {
      // 向上查找类别词（忽略无意义命名）
      const categoryDir = this.findCategoryDirInAncestors(dirParts);
      if (categoryDir) {
        const parentCategory = this.getCategoryName(categoryDir);
        if (parentCategory) {
          // 优先使用目录名 + 父级类别
          return this.buildEnhancedPurpose(parentCategory, dirName, primaryTypes);
        }
      }
    }

    // 如果目录名无法确定，再进行文件内容分析
    const contentAnalysis = await this.fileContentAnalyzer.analyzeDirectoryContent(
      dirPath,
      files,
      projectPath
    );

    if (contentAnalysis.purpose && contentAnalysis.confidence !== "low") {
      // 向上查找类别词（忽略无意义命名）
      const categoryDir = this.findCategoryDirInAncestors(dirParts);
      if (categoryDir) {
        return this.enhanceWithParentCategory(
          contentAnalysis.purpose,
          dirName,
          categoryDir
        );
      }
      return contentAnalysis.purpose;
    }

    // ========== 第四阶段：继承父级目录的语义（增强语义） ==========
    // 向上查找类别词，忽略无意义命名（如 src、lib 等）
    const categoryDir = this.findCategoryDirInAncestors(dirParts);
    if (categoryDir) {
      const parentCategory = this.getCategoryName(categoryDir);
      if (parentCategory) {
        // 父级（类别词） + 当前目录（业务词） + 职能强化词
        return this.buildEnhancedPurpose(parentCategory, dirName, primaryTypes);
      }
    }

    // 如果找不到类别词，且当前目录名不是类别词，使用当前目录名
    if (!this.isCategoryName(dirName) && !this.isMeaninglessName(dirName)) {
      // 检查是否是项目文件夹（通过上下文分析）
      const siblingPattern = this.analyzeSiblingPattern(siblingDirs);
      if (siblingPattern.isProjectPattern) {
        // 如果是项目模式，返回"项目"
        return `${dirName} 项目`;
      }
      
      // 检查目录名是否包含业务标识（连字符、下划线等）
      const hasBusinessIdentifier = /[-_]/.test(dirName);
      
      if (hasBusinessIdentifier) {
        // 尝试拆分目录名（如 gateway-common → gateway + common）
        const parts = dirName.split(/[-_]/);
        const categoryPart = parts.find((part) => this.isCategoryName(part));
        
        if (categoryPart) {
          // 如果拆分后有类别词，使用"业务词 + 类别词"格式
          const businessPart = parts.filter((p) => p !== categoryPart).join("-");
          const categoryName = this.getCategoryName(categoryPart);
          if (categoryName) {
            return businessPart ? `${businessPart} ${categoryName}` : categoryName;
          }
        }
      }
      
      // 只有在确实检测到工具文件时才使用"工具"
      // 否则使用目录名本身
      if (primaryTypes.includes("utility") && distribution.utility > 0) {
        return `${dirName} 工具`;
      }
      
      // 根据主要文件类型确定职能强化词（但不默认使用“工具”标签）
      const functionWord = this.getFunctionWordByFileTypes(primaryTypes);
      if (functionWord && functionWord !== "工具") {
        return `${dirName} ${functionWord}`;
      }
      
      // 如果无法确定，使用目录名本身
      return dirName;
    }

    // ========== 第五阶段：文件内容深度分析（全局适用，作为最后手段） ==========
    // 如果前面都没有确定，使用文件内容分析的结果（即使置信度低）
    if (contentAnalysis.purpose) {
      return contentAnalysis.purpose;
    }

    // 基于主要文件类型的兜底判断
    if (primaryTypes.length > 0) {
      const primaryType = primaryTypes[0];
      const fallbackPurpose = this.getPurposeByFileType(primaryType, dirName);
      if (fallbackPurpose && fallbackPurpose !== "其他") {
        return fallbackPurpose;
      }
    }

    // 最后兜底：如果目录名不是通用词且不是无意义命名，使用目录名
    if (!this.isCategoryName(dirName) && !this.isMeaninglessName(dirName)) {
      // 检查是否是项目文件夹（通过上下文分析）
      const siblingPattern = this.analyzeSiblingPattern(siblingDirs);
      if (siblingPattern.isProjectPattern) {
        return `${dirName} 项目`;
      }
      
      // 检查目录名是否包含业务标识
      const hasBusinessIdentifier = /[-_]/.test(dirName);
      
      if (hasBusinessIdentifier) {
        // 尝试拆分目录名
        const parts = dirName.split(/[-_]/);
        const categoryPart = parts.find((part) => this.isCategoryName(part));
        
        if (categoryPart) {
          const businessPart = parts.filter((p) => p !== categoryPart).join("-");
          const categoryName = this.getCategoryName(categoryPart);
          if (categoryName) {
            return businessPart ? `${businessPart} ${categoryName}` : categoryName;
          }
        }
      }
      
      return dirName;
    }

    return "其他";
  }

  /**
   * 第一阶段辅助：基于类别名称推断
   */
  private inferByCategoryName(dirName: string, dirPath: string): string | null {
    // 通用类别词映射（与 getCategoryName 保持一致）
    const categoryMap: Record<string, string> = {
      // 基础目录
      src: "源码",
      app: "应用入口",
      public: "公共资源",
      static: "静态资源",
      assets: "构建资源",
      // 组件和页面
      components: "通用组件",
      component: "通用组件",
      cmp: "通用组件",
      pages: "页面",
      page: "页面",
      views: "视图",
      view: "视图",
      layouts: "布局",
      layout: "布局",
      // 样式
      styles: "样式",
      style: "样式",
      css: "样式",
      scss: "样式",
      // 逻辑复用
      hooks: "逻辑复用",
      hook: "逻辑复用",
      composables: "组合逻辑",
      composable: "组合逻辑",
      // 工具和辅助
      utils: "工具函数",
      utilities: "工具函数",
      helpers: "辅助函数",
      helper: "辅助函数",
      tools: "工具",
      // 常量和配置
      constants: "常量",
      consts: "常量",
      config: "配置",
      configs: "配置",
      // 服务和接口
      services: "服务层",
      service: "服务层",
      api: "接口定义",
      apis: "接口定义",
      // 状态管理
      store: "状态管理",
      stores: "状态管理",
      state: "状态",
      // 路由
      router: "路由",
      routers: "路由",
      routes: "路由表",
      route: "路由表",
      // 业务模块
      modules: "业务模块",
      module: "业务模块",
      features: "功能模块",
      feature: "功能模块",
      // 数据模型
      models: "数据模型",
      model: "数据模型",
      entities: "领域实体",
      entity: "领域实体",
      // 类型定义
      types: "类型定义",
      type: "类型定义",
      interfaces: "接口定义",
      interface: "接口定义",
      enums: "枚举",
      enum: "枚举",
      // 后端相关
      controllers: "控制层",
      controller: "控制层",
      middlewares: "中间件",
      middleware: "中间件",
      guards: "权限校验",
      guard: "权限校验",
      policies: "权限策略",
      policy: "权限策略",
      providers: "服务提供",
      provider: "服务提供",
      adapters: "适配层",
      adapter: "适配层",
      repositories: "数据访问",
      repository: "数据访问",
      repo: "数据访问",
      // Web 相关
      directives: "指令",
      directive: "指令",
      plugins: "插件",
      plugin: "插件",
      // 结构定义和校验
      schemas: "结构定义",
      schema: "结构定义",
      validators: "校验",
      validator: "校验",
      dto: "传输对象",
      // 测试相关
      tests: "测试",
      test: "测试",
      __tests__: "测试",
      e2e: "端到端测试",
      mocks: "模拟数据",
      mock: "模拟数据",
      __mocks__: "模拟数据",
      fixtures: "测试数据",
      fixture: "测试数据",
      // 脚本和文档
      scripts: "脚本",
      script: "脚本",
      docs: "文档",
      doc: "文档",
      // 日志和临时
      logs: "日志",
      log: "日志",
      tmp: "临时文件",
      temp: "临时文件",
      // 构建产物
      build: "构建产物",
      dist: "发布产物",
      // 其他
      shared: "共享",
      common: "公共文件",
      commons: "公共文件",
      lib: "库",
      libs: "库",
      proto: "协议定义",
      protos: "协议定义",
      projects: "项目",
      project: "项目",
      // 国际化（保留原有）
      i18n: "国际化",
      locale: "国际化",
      locales: "国际化",
    };

    // 精确匹配
    if (categoryMap[dirName.toLowerCase()]) {
      return categoryMap[dirName.toLowerCase()];
    }

    // 部分匹配
    const lowerDirName = dirName.toLowerCase();
    for (const [key, value] of Object.entries(categoryMap)) {
      if (lowerDirName.includes(key) || dirPath.toLowerCase().includes(`/${key}/`)) {
        return value;
      }
    }

    return null;
  }

  /**
   * 检查是否是类别名称
   */
  private isCategoryName(dirName: string): boolean {
    const categoryNames = [
      // 基础目录
      "src", "app", "public", "static", "assets",
      // 组件和页面
      "components", "component", "cmp",
      "pages", "page", "views", "view",
      "layouts", "layout",
      // 样式
      "styles", "style", "css", "scss",
      // 逻辑复用
      "hooks", "hook",
      "composables", "composable",
      // 工具和辅助
      "utils", "utilities", "helpers", "helper", "tools",
      // 常量和配置
      "constants", "consts",
      "config", "configs",
      // 服务和接口
      "api", "apis", "services", "service",
      // 状态管理
      "store", "stores", "state",
      // 路由
      "routes", "route", "routers", "router",
      // 业务模块
      "modules", "module",
      "features", "feature",
      // 数据模型
      "models", "model",
      "entities", "entity",
      // 类型定义
      "types", "type",
      "interfaces", "interface",
      "enums", "enum",
      // 后端相关
      "controllers", "controller",
      "middlewares", "middleware",
      "guards", "guard",
      "policies", "policy",
      "providers", "provider",
      "adapters", "adapter",
      "repositories", "repository", "repo",
      // Web 相关
      "directives", "directive",
      "plugins", "plugin",
      // 结构定义和校验
      "schemas", "schema",
      "validators", "validator",
      "dto",
      // 测试相关
      "tests", "test", "__tests__",
      "e2e",
      "mocks", "mock", "__mocks__",
      "fixtures", "fixture",
      // 脚本和文档
      "scripts", "script",
      "docs", "doc",
      // 日志和临时
      "logs", "log",
      "tmp", "temp",
      // 构建产物
      "build", "dist",
      // 其他
      "shared", "common", "commons",
      "lib", "libs",
      "proto", "protos",
      "projects", "project",
      "layouts", "layout",
      "features", "feature", "modules", "module",
      "shared", "common", "commons",
      "config", "configs",
      "consts", "constants",
      "lib", "libs",
      "public", "assets", "static",
      "mocks", "mock", "__mocks__",
      "proto", "protos",
      "projects", "project",
    ];

    return categoryNames.includes(dirName.toLowerCase());
  }

  /**
   * 获取类别名称
   */
  private getCategoryName(dirName: string): string | null {
    const categoryMap: Record<string, string> = {
      // 基础目录
      src: "源码",
      app: "应用入口",
      public: "公共资源",
      static: "静态资源",
      assets: "构建资源",
      // 组件和页面
      components: "通用组件",
      component: "通用组件",
      pages: "页面",
      page: "页面",
      views: "视图",
      view: "视图",
      layouts: "布局",
      layout: "布局",
      // 样式
      styles: "样式",
      style: "样式",
      css: "样式",
      // 逻辑复用
      hooks: "逻辑复用",
      hook: "逻辑复用",
      composables: "组合逻辑",
      composable: "组合逻辑",
      // 工具和辅助
      utils: "工具函数",
      utilities: "工具函数",
      helpers: "辅助函数",
      helper: "辅助函数",
      tools: "工具",
      // 常量和配置
      constants: "常量",
      consts: "常量",
      config: "配置",
      configs: "配置",
      // 服务和接口
      services: "服务层",
      service: "服务层",
      api: "接口定义",
      apis: "接口定义",
      // 状态管理
      store: "状态管理",
      stores: "状态管理",
      state: "状态",
      // 路由
      router: "路由",
      routers: "路由",
      routes: "路由表",
      route: "路由表",
      // 业务模块
      modules: "业务模块",
      module: "业务模块",
      features: "功能模块",
      feature: "功能模块",
      // 数据模型
      models: "数据模型",
      model: "数据模型",
      entities: "领域实体",
      entity: "领域实体",
      // 类型定义
      types: "类型定义",
      type: "类型定义",
      interfaces: "接口定义",
      interface: "接口定义",
      enums: "枚举",
      enum: "枚举",
      // 后端相关
      controllers: "控制层",
      controller: "控制层",
      middlewares: "中间件",
      middleware: "中间件",
      guards: "权限校验",
      guard: "权限校验",
      policies: "权限策略",
      policy: "权限策略",
      providers: "服务提供",
      provider: "服务提供",
      adapters: "适配层",
      adapter: "适配层",
      repositories: "数据访问",
      repository: "数据访问",
      repo: "数据访问",
      // Web 相关
      directives: "指令",
      directive: "指令",
      plugins: "插件",
      plugin: "插件",
      // 结构定义和校验
      schemas: "结构定义",
      schema: "结构定义",
      validators: "校验",
      validator: "校验",
      dto: "传输对象",
      // 测试相关
      tests: "测试",
      test: "测试",
      __tests__: "测试",
      e2e: "端到端测试",
      mocks: "模拟数据",
      mock: "模拟数据",
      __mocks__: "模拟数据",
      fixtures: "测试数据",
      fixture: "测试数据",
      // 脚本和文档
      scripts: "脚本",
      script: "脚本",
      docs: "文档",
      doc: "文档",
      // 日志和临时
      logs: "日志",
      log: "日志",
      tmp: "临时文件",
      temp: "临时文件",
      // 构建产物
      build: "构建产物",
      dist: "发布产物",
      // 其他
      shared: "共享",
      common: "公共文件",
      commons: "公共文件",
      lib: "库",
      libs: "库",
      proto: "协议定义",
      protos: "协议定义",
      projects: "项目",
      project: "项目",
    };

    return categoryMap[dirName.toLowerCase()] || null;
  }

  /**
   * 判断是否是无意义的目录名（如 src、dist 等）
   * v1.9: 包含容器目录，确保在查找父级目录时跳过它们
   * 注意：lib 不在此列表中，lib 目录会进行正常的职能分析
   */
  private isMeaninglessName(dirName: string): boolean {
    const meaninglessNames = [
      "src",
      "source",
      "sources",
      "app",
      "apps",
      "dist",
      "build",
      "out",
      "output",
      "bin",
      "node_modules",
      ".git",
      ".vscode",
      ".idea",
      "tmp",
      "temp",
      "cache",
      ".cache",
      "coverage",
      ".nyc_output",
    ];

    return meaninglessNames.includes(dirName.toLowerCase());
  }

  /**
   * 在祖先目录中查找类别词（忽略无意义命名）
   * 返回最接近的类别词（优先级：components > pages > utils > services > lib > common/shared）
   */
  private findCategoryDirInAncestors(dirParts: string[]): string | null {
    // 类别词优先级（数字越小优先级越高）
    const categoryPriority: Record<string, number> = {
      components: 1,
      component: 1,
      pages: 2,
      page: 2,
      utils: 3,
      utilities: 3,
      services: 4,
      service: 4,
      lib: 5,
      libs: 5,
      hooks: 6,
      hook: 6,
      models: 7,
      model: 7,
      types: 8,
      type: 8,
      common: 9,
      shared: 9,
    };

    let bestCategory: string | null = null;
    let bestPriority = Infinity;

    // 从当前目录的父级开始，向上查找
    // dirParts 是从根目录到当前目录的所有部分
    // 我们需要从倒数第二个开始向上查找（跳过当前目录）
    for (let i = dirParts.length - 2; i >= 0; i--) {
      const dirName = dirParts[i].toLowerCase();
      
      // 跳过无意义命名
      if (this.isMeaninglessName(dirName)) {
        continue;
      }
      
      // 如果是类别词，检查优先级
      if (this.isCategoryName(dirName)) {
        const priority = categoryPriority[dirName] || 10;
        // 如果优先级更高（数字更小），更新最佳类别词
        if (priority < bestPriority) {
          bestCategory = dirName;
          bestPriority = priority;
        }
        // 如果找到最高优先级的类别词（components），直接返回
        if (priority === 1) {
          return dirName;
        }
      }
    }
    
    return bestCategory;
  }

  /**
   * 增强父级类别语义
   */
  private enhanceWithParentCategory(
    currentPurpose: string,
    currentDirName: string,
    parentDirName: string
  ): string {
    const parentCategory = this.getCategoryName(parentDirName);
    if (!parentCategory) {
      return currentPurpose;
    }

    // 如果当前目录名不是类别词，说明是业务词
    if (!this.isCategoryName(currentDirName)) {
      // 父级（类别词） + 当前目录（业务词） + 职能强化词
      return this.buildEnhancedPurpose(parentCategory, currentDirName, []);
    }

    // 如果当前也是类别词，直接返回当前用途
    return currentPurpose;
  }

  /**
   * 构建增强的职能名称
   */
  private buildEnhancedPurpose(
    parentCategory: string,
    currentDirName: string,
    primaryTypes: FileTypeCategory[]
  ): string {
    // 如果当前目录名是业务词，组合父级类别和当前业务词
    if (!this.isCategoryName(currentDirName)) {
      // 根据主要文件类型确定职能强化词
      let functionWord = "";
      if (primaryTypes.includes("component")) {
        functionWord = "组件";
      } else if (primaryTypes.includes("page")) {
        functionWord = "页面";
      } else if (primaryTypes.includes("service")) {
        functionWord = "API 服务";
      } else if (primaryTypes.includes("utility")) {
        functionWord = "工具";
      } else if (primaryTypes.includes("hook")) {
        functionWord = "Hooks";
      } else if (primaryTypes.includes("model")) {
        functionWord = "数据模型";
      } else {
        // 根据父级类别推断
        if (parentCategory === "组件") {
          functionWord = "组件";
        } else if (parentCategory === "API 服务" || parentCategory === "API") {
          functionWord = "API 服务";
        } else if (parentCategory === "工具") {
          functionWord = "工具";
        } else if (parentCategory === "库") {
          // lib 的子目录应该显示业务词 + "库"
          functionWord = "库";
        } else {
          functionWord = parentCategory;
        }
      }

      return `${currentDirName} ${functionWord}`;
    }

    return parentCategory;
  }

  /**
   * 基于文件类型获取职能（兜底）
   */
  private getPurposeByFileType(
    fileType: FileTypeCategory,
    dirName: string
  ): string {
    const typeMap: Record<FileTypeCategory, string> = {
      component: dirName !== "components" ? `${dirName} 组件` : "组件",
      page: dirName !== "pages" ? `${dirName} 页面` : "页面",
      hook: dirName !== "hooks" ? `${dirName} Hooks` : "Hooks",
      utility: dirName !== "utils" ? `${dirName} 工具` : "工具",
      service: dirName !== "services" ? `${dirName} API 服务` : "API 服务",
      type: "数据类型",
      enum: "枚举",
      constant: "常量",
      config: "配置",
      test: "测试",
      style: "样式",
      layout: "布局",
      middleware: "中间件",
      model: dirName !== "models" ? `${dirName} 数据模型` : "数据模型",
      repository: "数据仓库",
      controller: "控制器",
      route: "路由",
      other: "其他",
    };

    return typeMap[fileType] || "其他";
  }

  /**
   * 根据文件类型获取职能强化词
   */
  private getFunctionWordByFileTypes(
    primaryTypes: FileTypeCategory[]
  ): string {
    if (primaryTypes.includes("component")) {
      return "组件";
    } else if (primaryTypes.includes("page")) {
      return "页面";
    } else if (primaryTypes.includes("service")) {
      return "API 服务";
    } else if (primaryTypes.includes("utility")) {
      return "工具";
    } else if (primaryTypes.includes("hook")) {
      return "Hooks";
    } else if (primaryTypes.includes("model")) {
      return "数据模型";
    } else if (primaryTypes.includes("type")) {
      return "数据类型";
    } else if (primaryTypes.includes("enum")) {
      return "枚举";
    } else if (primaryTypes.includes("constant")) {
      return "常量";
    } else if (primaryTypes.includes("config")) {
      return "配置";
    } else if (primaryTypes.includes("test")) {
      return "测试";
    } else if (primaryTypes.includes("style")) {
      return "样式";
    } else if (primaryTypes.includes("route")) {
      return "路由";
    } else if (primaryTypes.includes("middleware")) {
      return "中间件";
    } else if (primaryTypes.includes("layout")) {
      return "布局";
    } else if (primaryTypes.includes("repository")) {
      return "数据仓库";
    } else if (primaryTypes.includes("controller")) {
      return "控制器";
    }
    return "";
  }

  /**
   * 翻译关键词（英文 -> 中文）
   */
  private translateKeyword(keyword: string): string {
    const translations: Record<string, string> = {
      user: "用户",
      auth: "认证",
      login: "登录",
      register: "注册",
      profile: "个人资料",
      payment: "支付",
      pay: "支付",
      wallet: "钱包",
      balance: "余额",
      transaction: "交易",
      order: "订单",
      cart: "购物车",
      product: "产品",
      inventory: "库存",
      insurance: "保险",
      claim: "理赔",
      policy: "保单",
      premium: "保费",
      loan: "贷款",
      credit: "信用",
      repayment: "还款",
      installment: "分期",
      report: "报表",
      dashboard: "仪表盘",
      analytics: "分析",
      statistics: "统计",
      notification: "通知",
      message: "消息",
      email: "邮件",
      sms: "短信",
      document: "文档",
      file: "文件",
      upload: "上传",
      download: "下载",
      setting: "设置",
      config: "配置",
      preference: "偏好",
    };

    return translations[keyword.toLowerCase()] || keyword;
  }

  /**
   * 推断目录分类
   */
  private inferDirectoryCategory(
    dirPath: string,
    purpose: string,
    primaryTypes: FileTypeCategory[]
  ): string {
    // 根据用途和文件类型确定分类（只判断英文，不判断中文）
    const purposeLower = purpose.toLowerCase();
    if (purposeLower.includes("component") || primaryTypes.includes("component")) {
      return "component";
    }
    if (purposeLower.includes("page") || primaryTypes.includes("page")) {
      return "page";
    }
    if (purposeLower.includes("hook") || primaryTypes.includes("hook")) {
      return "hook";
    }
    if (purposeLower.includes("util") || purposeLower.includes("utility") || purposeLower.includes("helper") || primaryTypes.includes("utility")) {
      return "utility";
    }
    if (purposeLower.includes("service") || purposeLower.includes("api") || primaryTypes.includes("service")) {
      return "service";
    }
    if (purposeLower.includes("type") || purposeLower.includes("interface") || primaryTypes.includes("type")) {
      return "type";
    }
    if (purposeLower.includes("model") || purposeLower.includes("entity") || primaryTypes.includes("model")) {
      return "model";
    }
    if (purposeLower.includes("route") || purposeLower.includes("router") || primaryTypes.includes("route")) {
      return "route";
    }
    if (purposeLower.includes("feature") || purposeLower.includes("module")) {
      return "feature";
    }
    if (purposeLower.includes("shared") || purposeLower.includes("common")) {
      return "shared";
    }

    return "other";
  }

  /**
   * 检测命名模式
   */
  private detectNamingPattern(
    files: string[]
  ): "PascalCase" | "camelCase" | "kebab-case" | "snake_case" | "mixed" {
    let pascalCount = 0;
    let camelCount = 0;
    let kebabCount = 0;
    let snakeCount = 0;

    for (const file of files) {
      const basename = path.basename(file, path.extname(file));

      if (basename.match(/^[A-Z][a-zA-Z0-9]+$/)) pascalCount++;
      else if (basename.match(/^[a-z][a-zA-Z0-9]+$/)) camelCount++;
      else if (basename.match(/^[a-z][a-z0-9-]+$/)) kebabCount++;
      else if (basename.match(/^[a-z][a-z0-9_]+$/)) snakeCount++;
    }

    const total = pascalCount + camelCount + kebabCount + snakeCount;
    if (total === 0) return "mixed";

    const max = Math.max(pascalCount, camelCount, kebabCount, snakeCount);

    if (max / total > 0.6) {
      if (max === pascalCount) return "PascalCase";
      if (max === camelCount) return "camelCase";
      if (max === kebabCount) return "kebab-case";
      if (max === snakeCount) return "snake_case";
    }

    return "mixed";
  }

  /**
   * 检测架构模式
   */
  private detectArchitecturePattern(
    dirPath: string,
    files: string[],
    distribution: Record<FileTypeCategory, number>
  ): string | undefined {
    const dirParts = dirPath.split(path.sep).filter(Boolean);
    const dirName = path.basename(dirPath).toLowerCase();

    // Clean Architecture 模式
    if (
      dirParts.includes("domain") ||
      dirParts.includes("application") ||
      dirParts.includes("infrastructure") ||
      dirParts.includes("presentation")
    ) {
      return "clean-architecture";
    }

    // Feature-based 模式
    if (
      dirParts.includes("features") ||
      dirParts.includes("modules") ||
      dirName.includes("feature")
    ) {
      return "feature-based";
    }

    // MVC 模式
    if (
      (dirParts.includes("models") || dirParts.includes("views") || dirParts.includes("controllers")) &&
      distribution.model > 0 &&
      distribution.controller > 0
    ) {
      return "mvc";
    }

    // Domain-driven 模式
    if (
      dirParts.includes("domain") ||
      dirParts.includes("entities") ||
      dirParts.includes("aggregates")
    ) {
      return "domain-driven";
    }

    // Layered 模式
    if (
      dirParts.includes("layers") ||
      (dirParts.includes("presentation") && dirParts.includes("business"))
    ) {
      return "layered";
    }

    return undefined;
  }

  /**
   * 检测 co-location 模式
   */
  private detectCoLocationPattern(
    files: string[],
    fileTypeMap: Map<string, FileTypeInfo>
  ): {
    styles: boolean;
    tests: boolean;
    types: boolean;
  } {
    let hasStyles = false;
    let hasTests = false;
    let hasTypes = false;

    for (const file of files) {
      const typeInfo = fileTypeMap.get(file);
      if (typeInfo) {
        if (typeInfo.category === "style") hasStyles = true;
        if (typeInfo.category === "test") hasTests = true;
        if (typeInfo.category === "type") hasTypes = true;
      }
    }

    return {
      styles: hasStyles,
      tests: hasTests,
      types: hasTypes,
    };
  }

  /**
   * 识别所属模块
   */
  private identifyModule(
    dirPath: string,
    modules: Array<{ name: string; path: string }>
  ): string | undefined {
    for (const module of modules) {
      if (dirPath.startsWith(module.path) || module.path.includes(dirPath)) {
        return module.name;
      }
    }
    return undefined;
  }

  /**
   * 识别版本标识
   */
  private identifyVersion(
    dirPath: string,
    files: string[]
  ): string | undefined {
    const dirParts = dirPath.split(path.sep).filter(Boolean);

    // 检查目录名中的版本标识
    for (const part of dirParts) {
      const lower = part.toLowerCase();
      // v1, v2, v3...
      if (lower.match(/^v\d+$/)) {
        return part;
      }
      // legacy, old, new, current
      if (["legacy", "old", "new", "current", "v1", "v2"].includes(lower)) {
        return part;
      }
    }

    // 检查文件名中的版本标识
    for (const file of files) {
      const fileName = path.basename(file).toLowerCase();
      if (fileName.match(/v\d+/)) {
        const match = fileName.match(/v\d+/);
        if (match) return match[0];
      }
    }

    return undefined;
  }

  /**
   * 获取子目录列表。
   * 当 dirToDirectFiles 可用时，直接从索引提取直接子目录（O(子目录)）；
   * 否则回退到对 allFiles 全量扫描（O(files)）。
   */
  private getChildDirectories(
    dirPath: string,
    allFiles: string[],
    projectPath: string,
    dirToDirectFiles?: Map<string, string[]>
  ): string[] {
    const prefix = dirPath + path.sep;

    if (dirToDirectFiles) {
      const children = new Set<string>();
      for (const childDir of dirToDirectFiles.keys()) {
        if (childDir.startsWith(prefix)) {
          const relative = childDir.substring(prefix.length);
          const firstPart = relative.split(path.sep)[0];
          if (firstPart) {
            children.add(path.join(dirPath, firstPart));
          }
        }
      }
      return Array.from(children);
    }

    // 兜底：无索引时对 allFiles 全量扫描
    const children = new Set<string>();
    for (const file of allFiles) {
      const fileDir = path.dirname(FileUtils.getRelativePath(projectPath, file));
      if (fileDir.startsWith(prefix)) {
        const relative = fileDir.substring(prefix.length);
        const firstPart = relative.split(path.sep)[0];
        if (firstPart) {
          children.add(path.join(dirPath, firstPart));
        }
      }
    }
    return Array.from(children);
  }

  /**
   * 建立目录层级关系
   */
  private buildDirectoryHierarchy(analyses: DeepDirectoryAnalysis[]): void {
    const pathMap = new Map<string, DeepDirectoryAnalysis>();
    for (const analysis of analyses) {
      pathMap.set(analysis.path, analysis);
    }

    for (const analysis of analyses) {
      const parts = analysis.path.split(path.sep).filter(Boolean);
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join(path.sep);
        const parent = pathMap.get(parentPath);
        if (parent) {
          analysis.parentDirectory = parentPath;
          if (!parent.childDirectories.includes(analysis.path)) {
            parent.childDirectories.push(analysis.path);
          }
        }
      }
    }
  }

  /**
   * 识别项目整体架构模式
   */
  async identifyArchitecturePattern(
    analyses: DeepDirectoryAnalysis[],
    projectPath: string,
    files: string[]
  ): Promise<ArchitecturePattern> {
    const indicators: string[] = [];
    let type: ArchitecturePattern["type"] = "unknown";
    let confidence: "high" | "medium" | "low" = "low";

    // 检查是否有 monorepo 特征
    const hasMonorepo = this.checkMonorepo(projectPath, files);
    if (hasMonorepo) {
      type = "monorepo";
      confidence = "high";
      indicators.push("检测到 monorepo 结构（packages/、apps/ 等目录）");
    }

    // 检查 Clean Architecture
    const cleanArchDirs = analyses.filter(
      (a) => a.architecturePattern === "clean-architecture"
    );
    if (cleanArchDirs.length > 0) {
      type = "clean-architecture";
      confidence = "high";
      indicators.push(`检测到 ${cleanArchDirs.length} 个 Clean Architecture 目录`);
    }

    // 检查 Feature-based
    const featureDirs = analyses.filter(
      (a) => a.architecturePattern === "feature-based"
    );
    if (featureDirs.length > 0 && !hasMonorepo) {
      type = "feature-based";
      confidence = "high";
      indicators.push(`检测到 ${featureDirs.length} 个功能模块目录`);
    }

    // 检查 MVC
    const mvcDirs = analyses.filter((a) => a.architecturePattern === "mvc");
    if (mvcDirs.length > 0 && !hasMonorepo) {
      type = "mvc";
      confidence = "medium";
      indicators.push("检测到 MVC 模式目录结构");
    }

    // 检查 Domain-driven
    const dddDirs = analyses.filter(
      (a) => a.architecturePattern === "domain-driven"
    );
    if (dddDirs.length > 0) {
      type = "domain-driven";
      confidence = "high";
      indicators.push("检测到 Domain-driven 模式");
    }

    // 检查微服务
    const hasMicroservices = this.checkMicroservices(projectPath, files);
    if (hasMicroservices) {
      type = "microservices";
      confidence = "high";
      indicators.push("检测到微服务架构（Dockerfile、docker-compose.yml）");
    }

    // 构建层级结构信息
    const layerStructure = this.buildLayerStructure(analyses);
    const featureStructure = this.buildFeatureStructure(analyses);

    return {
      type,
      confidence,
      indicators,
      layerStructure,
      featureStructure,
    };
  }

  /**
   * 检查是否为 monorepo
   */
  private checkMonorepo(projectPath: string, files: string[]): boolean {
    const monorepoIndicators = [
      "pnpm-workspace.yaml",
      "lerna.json",
      "nx.json",
      "turbo.json",
    ];

    for (const indicator of monorepoIndicators) {
      if (files.some((f) => f.includes(indicator))) {
        return true;
      }
    }

    // 检查是否有 packages/ 或 apps/ 目录
    const hasPackages = files.some((f) => f.includes("/packages/"));
    const hasApps = files.some((f) => f.includes("/apps/"));

    return hasPackages || hasApps;
  }

  /**
   * 检查是否为微服务
   */
  private checkMicroservices(projectPath: string, files: string[]): boolean {
    return (
      files.some((f) => f.includes("docker-compose.yml")) &&
      files.some((f) => f.includes("Dockerfile"))
    );
  }

  /**
   * 构建层级结构（Clean Architecture）
   */
  private buildLayerStructure(analyses: DeepDirectoryAnalysis[]): {
    presentation?: string[];
    application?: string[];
    domain?: string[];
    infrastructure?: string[];
  } | undefined {
    const layers: {
      presentation?: string[];
      application?: string[];
      domain?: string[];
      infrastructure?: string[];
    } = {};

    for (const analysis of analyses) {
      const dirParts = analysis.path.split(path.sep).filter(Boolean);
      if (dirParts.includes("presentation")) {
        if (!layers.presentation) layers.presentation = [];
        layers.presentation.push(analysis.path);
      }
      if (dirParts.includes("application")) {
        if (!layers.application) layers.application = [];
        layers.application.push(analysis.path);
      }
      if (dirParts.includes("domain")) {
        if (!layers.domain) layers.domain = [];
        layers.domain.push(analysis.path);
      }
      if (dirParts.includes("infrastructure")) {
        if (!layers.infrastructure) layers.infrastructure = [];
        layers.infrastructure.push(analysis.path);
      }
    }

    return Object.keys(layers).length > 0 ? layers : undefined;
  }

  /**
   * 构建功能结构（Feature-based）
   */
  private buildFeatureStructure(analyses: DeepDirectoryAnalysis[]): {
    features: string[];
    shared?: string[];
  } | undefined {
    const features: string[] = [];
    const shared: string[] = [];

    for (const analysis of analyses) {
      const dirParts = analysis.path.split(path.sep).filter(Boolean);
      if (dirParts.includes("features") || dirParts.includes("modules")) {
        // 只判断英文，不判断中文
        const analysisPurposeLower = (analysis.purpose || '').toLowerCase();
        if (analysisPurposeLower.includes("shared") || analysisPurposeLower.includes("common") || analysis.category === "shared") {
          shared.push(analysis.path);
        } else {
          features.push(analysis.path);
        }
      }
    }

    return features.length > 0 ? { features, shared: shared.length > 0 ? shared : undefined } : undefined;
  }

}

