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
      componentLocation: this.findDirectoriesByPurpose(structure, "components"),
      utilsLocation: this.findDirectoriesByPurpose(structure, "utilities"),
      typesLocation: this.findDirectoriesByPurpose(structure, "types"),
      stylesLocation: this.findDirectoriesByPurpose(structure, "styles"),
      apiLocation: this.findDirectoriesByPurpose(structure, "API"),
      hooksLocation: this.findDirectoriesByPurpose(structure, "hooks"),
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
    if (dirName.includes("component")) return "components";
    if (dirName.includes("hook")) return "hooks";
    if (dirName.includes("composable")) return "composables (Vue)";
    if (dirName.includes("util") || dirName.includes("helper")) return "utilities";
    if (dirName.includes("type") || dirName.includes("interface")) return "types";
    if (dirName.includes("style") || dirName.includes("css")) return "styles";
    if (dirName.includes("api") || dirName.includes("service")) return "API";
    if (dirName.includes("page") || dirName.includes("route")) return "pages";
    if (dirName.includes("layout")) return "layouts";
    if (dirName.includes("feature")) return "feature modules";
    if (dirName.includes("shared") || dirName.includes("common")) return "shared";
    if (dirName.includes("config")) return "configuration";
    if (dirName.includes("script")) return "scripts";
    if (dirName.includes("test") || dirName.includes("__tests__")) return "tests";
    if (dirName.includes("directive")) return "directives";
    if (dirName.includes("plugin")) return "plugins";
    if (dirName.includes("guard")) return "route guards";

    const extensions = files.map((f) => path.extname(f));
    if (extensions.some((ext) => [".css", ".scss", ".less"].includes(ext))) {
      return "styles";
    }
    if (files.some((f) => path.basename(f).includes(".test."))) {
      return "tests";
    }

    return "general";
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

    // Detect general file naming by sampling non-component source files
    const sourceFiles = files.filter(
      (f) => /\.(ts|js)$/.test(f) &&
        !f.includes("node_modules") &&
        !path.basename(f).startsWith("index.") &&
        !path.basename(f).startsWith(".")
    );
    let camelCount = 0;
    let kebabFileCount = 0;
    for (const f of sourceFiles.slice(0, 200)) {
      const base = path.basename(f, path.extname(f));
      if (/^[a-z][a-zA-Z0-9]+$/.test(base) && /[A-Z]/.test(base)) camelCount++;
      else if (/^[a-z][a-z0-9]+(-[a-z0-9]+)+$/.test(base)) kebabFileCount++;
    }
    const fileNaming: "camelCase" | "kebab-case" | "mixed" =
      kebabFileCount > camelCount * 2 ? "kebab-case"
      : camelCount > kebabFileCount * 2 ? "camelCase"
      : "mixed";

    return {
      components: componentNaming,
      files: fileNaming,
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
    return structure
      .filter((d) => d.purpose === purpose)
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length)
      .map((d) => d.path);
  }
}

