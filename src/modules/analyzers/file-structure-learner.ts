import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";

/**
 * 文件结构学习器
 * 学习项目的目录组织、文件命名模式等
 */

export interface DirectoryPurpose {
  path: string;
  purpose: string;
  fileCount: number;
  fileTypes: string[];
  namingPattern: "PascalCase" | "camelCase" | "kebab-case" | "mixed";
}

export interface FileOrganization {
  structure: DirectoryPurpose[];
  componentLocation: string[];
  utilsLocation: string[];
  typesLocation: string[];
  stylesLocation: string[];
  apiLocation: string[];
  hooksLocation: string[];
  namingConvention: {
    components: "PascalCase" | "kebab-case" | "mixed";
    files: "camelCase" | "kebab-case" | "mixed";
    useIndexFiles: boolean;
  };
}

export class FileStructureLearner {
  /**
   * 学习项目的文件组织结构
   */
  async learnStructure(
    projectPath: string,
    files: string[]
  ): Promise<FileOrganization> {
    const directories = this.extractDirectories(projectPath, files);
    const structure = await this.analyzeDirectories(projectPath, directories, files);

    return {
      structure,
      componentLocation: this.findDirectoriesByPurpose(structure, "组件"),
      utilsLocation: this.findDirectoriesByPurpose(structure, "工具"),
      typesLocation: this.findDirectoriesByPurpose(structure, "类型"),
      stylesLocation: this.findDirectoriesByPurpose(structure, "样式"),
      apiLocation: this.findDirectoriesByPurpose(structure, "API"),
      hooksLocation: this.findDirectoriesByPurpose(structure, "Hooks"),
      namingConvention: this.detectNamingConvention(files),
    };
  }

  /**
   * 提取所有目录
   */
  private extractDirectories(projectPath: string, files: string[]): Set<string> {
    const directories = new Set<string>();

    for (const file of files) {
      const relativePath = FileUtils.getRelativePath(projectPath, file);
      const dir = path.dirname(relativePath);
      
      if (dir && dir !== ".") {
        // 添加所有父目录
        const parts = dir.split(path.sep);
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
   * 分析目录用途
   */
  private async analyzeDirectories(
    projectPath: string,
    directories: Set<string>,
    allFiles: string[]
  ): Promise<DirectoryPurpose[]> {
    const result: DirectoryPurpose[] = [];

    for (const dir of directories) {
      const fullPath = path.join(projectPath, dir);
      const filesInDir = allFiles.filter((f) =>
        f.startsWith(fullPath + path.sep)
      );
      const directFilesInDir = filesInDir.filter(
        (f) => path.dirname(f) === fullPath
      );

      if (directFilesInDir.length === 0) continue;

      const purpose = this.inferDirectoryPurpose(dir, directFilesInDir);
      const fileTypes = this.getFileTypes(directFilesInDir);
      const namingPattern = this.detectDirNamingPattern(directFilesInDir);

      result.push({
        path: dir,
        purpose,
        fileCount: directFilesInDir.length,
        fileTypes,
        namingPattern,
      });
    }

    return result;
  }

  /**
   * 推断目录用途
   */
  private inferDirectoryPurpose(
    dirPath: string,
    files: string[]
  ): string {
    const dirName = path.basename(dirPath).toLowerCase();

    // 根据目录名判断
    if (dirName.includes("component")) return "组件";
    if (dirName.includes("hook")) return "Hooks";
    if (dirName.includes("composable")) return "逻辑复用（Vue）";
    if (dirName.includes("util") || dirName.includes("helper")) return "工具";
    if (dirName.includes("type") || dirName.includes("interface")) return "类型";
    if (dirName.includes("style") || dirName.includes("css")) return "样式";
    if (dirName.includes("api") || dirName.includes("service")) return "API";
    if (dirName.includes("page") || dirName.includes("route")) return "页面";
    if (dirName.includes("layout")) return "布局";
    if (dirName.includes("feature")) return "功能模块";
    if (dirName.includes("shared") || dirName.includes("common")) return "共享";
    if (dirName.includes("config")) return "配置";
    if (dirName.includes("script")) return "脚本";
    if (dirName.includes("test") || dirName.includes("__tests__")) return "测试";
    if (dirName.includes("directive")) return "自定义指令";
    if (dirName.includes("plugin")) return "插件注册";
    if (dirName.includes("guard")) return "路由守卫";

    // 根据文件内容判断
    const extensions = files.map((f) => path.extname(f));
    if (extensions.some((ext) => [".css", ".scss", ".less"].includes(ext))) {
      return "样式";
    }
    if (files.some((f) => path.basename(f).includes(".test."))) {
      return "测试";
    }

    return "其他";
  }

  /**
   * 获取文件类型
   */
  private getFileTypes(files: string[]): string[] {
    const types = new Set<string>();
    for (const file of files) {
      const ext = path.extname(file).slice(1);
      if (ext) types.add(ext);
    }
    return Array.from(types);
  }

  /**
   * 检测目录的命名模式
   */
  private detectDirNamingPattern(
    files: string[]
  ): "PascalCase" | "camelCase" | "kebab-case" | "mixed" {
    let pascalCount = 0;
    let camelCount = 0;
    let kebabCount = 0;

    for (const file of files) {
      const basename = path.basename(file, path.extname(file));

      if (basename.match(/^[A-Z][a-zA-Z0-9]+$/)) pascalCount++;
      else if (basename.match(/^[a-z][a-zA-Z0-9]+$/)) camelCount++;
      else if (basename.match(/^[a-z][a-z0-9-]+$/)) kebabCount++;
    }

    const total = pascalCount + camelCount + kebabCount;
    if (total === 0) return "mixed";

    if (pascalCount / total > 0.6) return "PascalCase";
    if (camelCount / total > 0.6) return "camelCase";
    if (kebabCount / total > 0.6) return "kebab-case";

    return "mixed";
  }

  /**
   * 检测命名约定
   */
  private detectNamingConvention(files: string[]): {
    components: "PascalCase" | "kebab-case" | "mixed";
    files: "camelCase" | "kebab-case" | "mixed";
    useIndexFiles: boolean;
  } {
    const componentFiles = files.filter(
      (f) =>
        (f.includes("/components/") || f.match(/[A-Z][a-zA-Z]+\.(tsx?|jsx|vue)$/)) &&
        !f.includes("node_modules")
    );

    const indexFileCount = files.filter((f) =>
      path.basename(f).startsWith("index.")
    ).length;
    const useIndexFiles = indexFileCount / files.length > 0.1;

    let pascalComponents = 0;
    let kebabComponents = 0;

    for (const file of componentFiles) {
      const basename = path.basename(file, path.extname(file));
      if (basename.match(/^[A-Z][a-zA-Z0-9]+$/)) pascalComponents++;
      else if (basename.match(/^[a-z][a-z0-9-]+$/)) kebabComponents++;
    }

    const componentNaming =
      pascalComponents > kebabComponents ? "PascalCase" : "kebab-case";

    return {
      components: componentNaming,
      files: "camelCase", // 默认
      useIndexFiles,
    };
  }

  /**
   * 按用途查找目录
   */
  private findDirectoriesByPurpose(
    structure: DirectoryPurpose[],
    purpose: string
  ): string[] {
    return structure.filter((d) => d.purpose === purpose).map((d) => d.path);
  }
}

