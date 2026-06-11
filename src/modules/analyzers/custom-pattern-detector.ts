import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";

/**
 * 自定义模式检测器
 * 识别项目中的自定义 hooks、工具函数、设计模式等
 */

export interface CustomHook {
  name: string;
  filePath: string;
  relativePath: string;
  usage: string;
  frequency: number;
  description?: string;
}

export interface CustomUtil {
  name: string;
  filePath: string;
  relativePath: string;
  category: string;
  frequency: number;
  signature?: string;
}

export interface APIClientInfo {
  exists: boolean;
  name?: string;
  filePath?: string;
  /** 实际导出名（如 ajax、request），用于生成正确的 import 语句 */
  exportName?: string;
  /** default | named */
  importStyle?: "default" | "named";
  methods?: string[];
  hasErrorHandling: boolean;
  hasAuth: boolean;
}

export class CustomPatternDetector {
  /**
   * 检测自定义 Hooks（React 项目）
   */
  async detectCustomHooks(
    projectPath: string,
    files: string[]
  ): Promise<CustomHook[]> {
    // 策略 1：文件名以 use[A-Z] 开头的文件
    const hookFiles = files.filter((f) => {
      const basename = path.basename(f);
      return (
        basename.startsWith("use") &&
        basename.match(/^use[A-Z]/) &&
        /\.(ts|tsx|js|jsx)$/.test(f) &&
        !f.includes("node_modules")
      );
    });

    // 策略 2：hooks/ 目录下的所有 ts/tsx/js/jsx 文件（可能导出 useXxx 但文件名不以 use 开头）
    const hookDirFiles = files.filter((f) => {
      const inHooksDir = /\/hooks?\//.test(f);
      return (
        inHooksDir &&
        /\.(ts|tsx|js|jsx)$/.test(f) &&
        !f.includes("node_modules") &&
        !f.includes(".test.") && !f.includes(".spec.") &&
        !hookFiles.includes(f)
      );
    });

    const allHookSourceFiles = [...hookFiles, ...hookDirFiles];

    // 1) 先从 hook 文件中提取所有 symbol 名
    const hookCandidates: Array<{
      name: string;
      file: string;
      content: string;
    }> = [];
    const seenNames = new Set<string>();

    const hookContents = await Promise.all(
      allHookSourceFiles.map((f) => FileUtils.readFile(f)),
    );

    for (let i = 0; i < allHookSourceFiles.length; i++) {
      const file = allHookSourceFiles[i];
      const content = hookContents[i];
      const basename = path.basename(file, path.extname(file));

      // 匹配文件中所有导出的 use[A-Z] 开头函数
      const exportMatches = content.matchAll(
        /export\s+(?:function|const)\s+(use[A-Z]\w+)/g
      );
      for (const match of exportMatches) {
        if (!seenNames.has(match[1])) {
          seenNames.add(match[1]);
          hookCandidates.push({ name: match[1], file, content });
        }
      }

      // 也匹配文件名本身如果以 use 开头
      if (basename.match(/^use[A-Z]/) && !seenNames.has(basename)) {
        const nameMatch = content.match(
          new RegExp(`export.*(?:function|const)\\s+(${basename})`)
        );
        if (nameMatch) {
          seenNames.add(nameMatch[1]);
          hookCandidates.push({ name: nameMatch[1], file, content });
        }
      }
    }

    // 2) 批量构建使用频率索引（一次遍历 300 个文件，替代 N×300）
    const names = hookCandidates.map((h) => h.name);
    const usageIndex = names.length > 0
      ? await this.buildUsageIndex(names, files)
      : new Map<string, number>();

    // 3) 组装结果
    const hooks: CustomHook[] = hookCandidates.map((h) => ({
      name: h.name,
      filePath: h.file,
      relativePath: FileUtils.getRelativePath(projectPath, h.file),
      usage: this.extractHookUsage(h.content, h.name),
      frequency: usageIndex.get(h.name) ?? 0,
      description: this.extractCommentDescription(h.content, h.name),
    }));

    return hooks.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 检测自定义工具函数
   */
  async detectCustomUtils(
    projectPath: string,
    files: string[]
  ): Promise<CustomUtil[]> {
    const utilFiles = files.filter(
      (f) =>
        (f.includes("/utils/") ||
          f.includes("/helpers/") ||
          f.includes("/lib/")) &&
        /\.(ts|tsx|js|jsx)$/.test(f) &&
        !f.includes("node_modules") &&
        !path.basename(f).startsWith("index")
    );

    // 1) 并行读取所有 util 文件，提取 symbol 名
    const utilContents = await Promise.all(
      utilFiles.map((f) => FileUtils.readFile(f)),
    );

    const candidates: Array<{
      name: string;
      file: string;
      content: string;
      category: string;
    }> = [];

    for (let i = 0; i < utilFiles.length; i++) {
      const file = utilFiles[i];
      const content = utilContents[i];
      const category = this.categorizeUtil(file);

      const functionMatches = content.matchAll(
        /export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g
      );

      for (const match of functionMatches) {
        candidates.push({ name: match[1], file, content, category });
      }
    }

    // 2) 批量构建使用频率索引
    const names = candidates.map((c) => c.name);
    const usageIndex = names.length > 0
      ? await this.buildUsageIndex(names, files)
      : new Map<string, number>();

    // 3) 过滤 frequency > 0 并组装
    const utils: CustomUtil[] = [];
    for (const c of candidates) {
      const frequency = usageIndex.get(c.name) ?? 0;
      if (frequency > 0) {
        utils.push({
          name: c.name,
          filePath: c.file,
          relativePath: FileUtils.getRelativePath(projectPath, c.file),
          category: c.category,
          frequency,
          signature: this.extractFunctionSignature(c.content, c.name),
        });
      }
    }

    return utils.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 检测 API 客户端
   *
   * 策略：
   * 1. 精确文件名匹配（api-client.ts, request.ts 等）
   * 2. 在 lib/, utils/, services/ 下扫描 axios.create() / export default axios 等模式
   */
  async detectAPIClient(
    projectPath: string,
    files: string[]
  ): Promise<APIClientInfo> {
    const namePatterns = [
      "api-client", "apiClient", "http-client", "httpClient",
      "request", "api", "axios", "http",
    ];

    // 策略 1：精确文件名匹配
    for (const pattern of namePatterns) {
      const apiFile = files.find(
        (f) =>
          path.basename(f, path.extname(f)) === pattern &&
          /\.(ts|tsx|js|jsx)$/.test(f)
      );
      if (apiFile) {
        const result = await this.analyzeHttpClientFile(projectPath, apiFile);
        if (result) return result;
      }
    }

    // 策略 2：扫描 lib/, utils/, services/ 下的文件查找 axios 实例
    const scanDirs = ["lib/", "utils/", "services/", "common/", "helpers/"];
    const candidates = files.filter(
      (f) =>
        scanDirs.some((d) => f.includes(`/${d}`)) &&
        /\.(ts|js)$/.test(f) &&
        !f.includes(".test.") && !f.includes(".spec.")
    );
    for (const file of candidates.slice(0, 30)) {
      const content = await FileUtils.readFile(file);
      if (
        content.includes("axios.create") ||
        content.includes("axios.defaults") ||
        (content.includes("import axios") && content.includes("export"))
      ) {
        const result = await this.analyzeHttpClientFile(projectPath, file, content);
        if (result) return result;
      }
    }

    return { exists: false, hasErrorHandling: false, hasAuth: false };
  }

  /**
   * 分析单个 HTTP 客户端文件，提取导出名、import 风格等信息
   */
  private async analyzeHttpClientFile(
    projectPath: string,
    filePath: string,
    existingContent?: string
  ): Promise<APIClientInfo | null> {
    const content = existingContent ?? await FileUtils.readFile(filePath);
    if (!content) return null;

    const relPath = FileUtils.getRelativePath(projectPath, filePath);
    const hasErrorHandling = content.includes("catch") || content.includes("interceptors.response");
    const hasAuth =
      content.includes("auth") ||
      content.includes("token") ||
      content.includes("Authorization");

    // 检测 default export 的名称
    const defaultExportMatch =
      content.match(/export\s+default\s+(\w+)/) ||
      content.match(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/);
    if (defaultExportMatch) {
      return {
        exists: true,
        name: defaultExportMatch[1],
        exportName: defaultExportMatch[1],
        importStyle: "default",
        filePath: relPath,
        methods: this.extractAPIMethods(content),
        hasErrorHandling,
        hasAuth,
      };
    }

    // 检测 named export（如 export const ajax = ...）
    const namedExportMatch = content.match(
      /export\s+(?:const|function)\s+(\w+)\s*=?\s*(?:axios\.create|axios\.defaults)/
    );
    if (namedExportMatch) {
      return {
        exists: true,
        name: namedExportMatch[1],
        exportName: namedExportMatch[1],
        importStyle: "named",
        filePath: relPath,
        methods: this.extractAPIMethods(content),
        hasErrorHandling,
        hasAuth,
      };
    }

    // 兜底：文件包含 axios 相关内容，用文件名作为名称
    if (content.includes("axios")) {
      const baseName = path.basename(filePath, path.extname(filePath));
      return {
        exists: true,
        name: baseName,
        filePath: relPath,
        methods: this.extractAPIMethods(content),
        hasErrorHandling,
        hasAuth,
      };
    }

    return null;
  }

  /**
   * 批量构建使用频率索引：一次遍历源文件，用合并正则匹配所有 symbol。
   * 返回 Map<symbolName, totalMatchCount>。
   *
   * 替代旧的 countUsageInProject（每个 symbol 各遍历 300 文件），
   * 将 O(N×300) 降为 O(300)（N = symbol 数量）。
   */
  private async buildUsageIndex(
    names: string[],
    files: string[],
  ): Promise<Map<string, number>> {
    const index = new Map<string, number>();
    for (const n of names) index.set(n, 0);

    const sourceFiles = files.filter(
      (f) =>
        /\.(ts|tsx|js|jsx|vue|svelte)$/.test(f) &&
        !/[\\/](dist|build|node_modules|\.cache)[\\/]/.test(f),
    );
    const sampleFiles = sourceFiles.slice(0, 300);

    // 预编译合并正则：\b(name1|name2|...)\b
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const combinedRe = new RegExp(`\\b(${escaped.join("|")})\\b`, "g");

    const contents = await Promise.all(
      sampleFiles.map((f) => FileUtils.readFile(f)),
    );

    for (const content of contents) {
      let m: RegExpExecArray | null;
      combinedRe.lastIndex = 0;
      while ((m = combinedRe.exec(content)) !== null) {
        const name = m[1];
        index.set(name, (index.get(name) ?? 0) + 1);
      }
    }

    return index;
  }

  /**
   * 提取 Hook 使用示例
   */
  private extractHookUsage(content: string, hookName: string): string {
    // 查找函数定义
    const funcMatch = content.match(
      new RegExp(`(?:function|const)\\s+${hookName}\\s*[=:]?\\s*\\([^)]*\\)`)
    );

    if (funcMatch) {
      return funcMatch[0];
    }

    return `const result = ${hookName}()`;
  }

  /**
   * 提取注释描述
   */
  private extractCommentDescription(
    content: string,
    name: string
  ): string | undefined {
    // 查找函数定义前的注释
    const lines = content.split("\n");
    const defIndex = lines.findIndex((l) => l.includes(`${name}`));

    if (defIndex > 0) {
      // 向上查找注释
      for (let i = defIndex - 1; i >= Math.max(0, defIndex - 5); i--) {
        const line = lines[i].trim();
        if (line.startsWith("//") || line.startsWith("*")) {
          return line.replace(/^[\/\*\s]+/, "");
        }
      }
    }

    return undefined;
  }

  /**
   * 分类工具函数
   */
  private categorizeUtil(filePath: string): string {
    const basename = path.basename(filePath, path.extname(filePath));
    const dirname = path.dirname(filePath);

    if (basename.includes("date") || basename.includes("time"))
      return "Date/Time";
    if (basename.includes("format")) return "Formatting";
    if (basename.includes("valid")) return "Validation";
    if (basename.includes("api") || basename.includes("http"))
      return "API";
    if (basename.includes("storage")) return "Storage";
    if (basename.includes("auth")) return "Auth";
    if (dirname.includes("validation")) return "Validation";
    if (dirname.includes("formatting")) return "Formatting";

    return "General";
  }

  /**
   * 提取函数签名
   */
  private extractFunctionSignature(
    content: string,
    funcName: string
  ): string | undefined {
    const signatureMatch = content.match(
      new RegExp(
        `(?:export\\s+)?(?:async\\s+)?(?:function|const)\\s+${funcName}\\s*[=:]?\\s*\\([^)]*\\)(?::\\s*[^{;]+)?`
      )
    );

    return signatureMatch?.[0];
  }

  /**
   * 提取 API 方法
   */
  private extractAPIMethods(content: string): string[] {
    const methods: string[] = [];

    if (content.includes(".get(")) methods.push("get");
    if (content.includes(".post(")) methods.push("post");
    if (content.includes(".put(")) methods.push("put");
    if (content.includes(".delete(")) methods.push("delete");
    if (content.includes(".patch(")) methods.push("patch");

    return methods;
  }
}

