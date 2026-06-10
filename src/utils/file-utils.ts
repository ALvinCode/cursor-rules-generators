import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "./logger.js";
import { FileOperationError } from "./errors.js";

/**
 * 文件工具类
 */
export class FileUtils {
  /**
   * Per-run 读缓存：absolutePath → content。
   * 由 enableCache() / clearCache() 控制生命周期，避免同一次分析管线中多个 analyzer
   * 重复读取同一文件（如 package.json 被 4 个模块各读一次）。
   * cache 为 null 时缓存关闭，readFile 直接读磁盘。
   */
  private static cache: Map<string, string> | null = null;

  static enableCache(): void {
    this.cache = new Map();
  }

  static clearCache(): void {
    this.cache = null;
  }

  /**
   * 需要排除的目录
   */
  private static EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "out",
    "coverage",
    ".cache",
    ".vscode",
    ".idea",
    "__pycache__",
    ".pytest_cache",
    "venv",
    "env",
    ".env",
    "target",
    "bin",
    "obj",
  ]);

  /**
   * 需要分析的文件扩展名
   */
  private static USEFUL_EXTENSIONS = new Set([
    // 代码文件
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
    ".cs",
    ".php",
    ".rb",
    ".swift",
    ".kt",
    ".scala",
    ".dart",
    ".vue",
    ".svelte",
    // 配置文件
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".env",
    ".config",
    // 文档文件
    ".md",
    ".mdx",
    ".txt",
    // Web 文件
    ".html",
    ".css",
    ".scss",
    ".sass",
    ".less",
    // 构建配置
    ".lock",
    "Dockerfile",
    ".dockerignore",
    "Makefile",
  ]);

  /**
   * 检查是否应该排除该目录
   */
  static shouldExcludeDir(dirName: string): boolean {
    return this.EXCLUDED_DIRS.has(dirName) || dirName.startsWith(".");
  }

  /**
   * 检查文件是否有用
   */
  static isUsefulFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName);

    // 检查特殊文件名
    const specialFiles = [
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "requirements.txt",
      "Pipfile",
      "Pipfile.lock",
      "Cargo.toml",
      "Cargo.lock",
      "go.mod",
      "go.sum",
      "composer.json",
      "Gemfile",
      "Gemfile.lock",
      "pubspec.yaml",
      "README.md",
      "README",
      "tsconfig.json",
      "jsconfig.json",
      "vite.config.ts",
      "vite.config.js",
      "next.config.js",
      "nuxt.config.ts",
      "tailwind.config.js",
      "postcss.config.js",
      "babel.config.js",
      ".eslintrc",
      ".prettierrc",
      "Dockerfile",
      "docker-compose.yml",
      "Makefile",
    ];

    if (specialFiles.includes(baseName)) {
      return true;
    }

    return this.USEFUL_EXTENSIONS.has(ext);
  }

  /**
   * 递归收集目录下的所有有用文件
   */
  static async collectFiles(
    dirPath: string,
    maxDepth: number = 10,
    currentDepth: number = 0,
    basePath?: string
  ): Promise<string[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const actualBasePath = basePath || dirPath;
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // 同层子目录并行递归遍历
      const subDirPromises: Promise<string[]>[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!this.shouldExcludeDir(entry.name)) {
            subDirPromises.push(
              this.collectFiles(fullPath, maxDepth, currentDepth + 1, actualBasePath),
            );
          }
        } else if (entry.isFile()) {
          if (this.isUsefulFile(entry.name)) {
            files.push(fullPath);
          }
        }
      }

      if (subDirPromises.length > 0) {
        const subResults = await Promise.all(subDirPromises);
        for (const sub of subResults) {
          files.push(...sub);
        }
      }
    } catch (error) {
      logger.error(`读取目录失败 ${dirPath}`, error);
    }

    return files;
  }

  /**
   * 读取文件内容（启用缓存时同一路径只读一次磁盘）。
   */
  static async readFile(filePath: string): Promise<string> {
    try {
      const abs = path.resolve(filePath);
      if (this.cache) {
        const cached = this.cache.get(abs);
        if (cached !== undefined) return cached;
      }
      const content = await fs.readFile(abs, "utf-8");
      this.cache?.set(abs, content);
      return content;
    } catch (error) {
      logger.error(`读取文件失败 ${filePath}`, error);
      return "";
    }
  }

  /**
   * 写入文件内容
   */
  static async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
    } catch (error) {
      logger.error(`写入文件失败 ${filePath}`, error);
      throw new FileOperationError(`无法写入文件: ${filePath}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 检查文件是否存在
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取相对路径
   */
  static getRelativePath(basePath: string, filePath: string): string {
    return path.relative(basePath, filePath);
  }

  /**
   * 读取目录内容
   */
  static async readdir(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath);
      return entries;
    } catch (error) {
      logger.error(`读取目录失败 ${dirPath}`, error);
      return [];
    }
  }

  /**
   * 检查目录是否存在
   */
  static async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 创建目录
   */
  static async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: options?.recursive ?? true });
    } catch (error) {
      logger.error(`创建目录失败 ${dirPath}`, error);
      throw new FileOperationError(`无法创建目录: ${dirPath}`, error instanceof Error ? error : undefined);
    }
  }
}

