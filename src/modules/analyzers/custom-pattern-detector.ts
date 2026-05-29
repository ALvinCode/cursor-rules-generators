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
    const hooks: CustomHook[] = [];
    
    // 查找 hooks 文件
    const hookFiles = files.filter((f) => {
      const basename = path.basename(f);
      return (
        basename.startsWith("use") &&
        basename.match(/^use[A-Z]/) &&
        /\.(ts|tsx|js|jsx)$/.test(f) &&
        !f.includes("node_modules")
      );
    });

    for (const file of hookFiles) {
      const content = await FileUtils.readFile(file);
      const basename = path.basename(file, path.extname(file));

      // 提取 hook 名称
      const exportMatch =
        content.match(new RegExp(`export.*(?:function|const)\\s+(${basename})`)) ||
        content.match(/export\s+(?:function|const)\s+(use[A-Z]\w+)/);

      if (exportMatch) {
        const hookName = exportMatch[1];

        // 统计使用频率（在其他文件中搜索导入）
        const frequency = await this.countUsageInProject(hookName, files);

        // 提取使用示例
        const usageExample = this.extractHookUsage(content, hookName);

        hooks.push({
          name: hookName,
          filePath: file,
          relativePath: FileUtils.getRelativePath(projectPath, file),
          usage: usageExample,
          frequency,
          description: this.extractCommentDescription(content, hookName),
        });
      }
    }

    // 按使用频率排序
    return hooks.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 检测自定义工具函数
   */
  async detectCustomUtils(
    projectPath: string,
    files: string[]
  ): Promise<CustomUtil[]> {
    const utils: CustomUtil[] = [];

    // 查找工具文件目录
    const utilFiles = files.filter(
      (f) =>
        (f.includes("/utils/") ||
          f.includes("/helpers/") ||
          f.includes("/lib/")) &&
        /\.(ts|tsx|js|jsx)$/.test(f) &&
        !f.includes("node_modules") &&
        !path.basename(f).startsWith("index")
    );

    for (const file of utilFiles) {
      const content = await FileUtils.readFile(file);
      const category = this.categorizeUtil(file);

      // 提取导出的函数
      const functionMatches = content.matchAll(
        /export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g
      );

      for (const match of functionMatches) {
        const funcName = match[1];
        const frequency = await this.countUsageInProject(funcName, files);

        if (frequency > 0) {
          utils.push({
            name: funcName,
            filePath: file,
            relativePath: FileUtils.getRelativePath(projectPath, file),
            category,
            frequency,
            signature: this.extractFunctionSignature(content, funcName),
          });
        }
      }
    }

    return utils.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 检测 API 客户端
   */
  async detectAPIClient(
    projectPath: string,
    files: string[]
  ): Promise<APIClientInfo> {
    // 常见的 API 客户端文件名
    const apiClientPatterns = [
      "api-client",
      "apiClient",
      "http-client",
      "httpClient",
      "request",
      "api",
    ];

    for (const pattern of apiClientPatterns) {
      const apiFile = files.find(
        (f) =>
          path.basename(f, path.extname(f)) === pattern &&
          /\.(ts|tsx|js|jsx)$/.test(f)
      );

      if (apiFile) {
        const content = await FileUtils.readFile(apiFile);

        return {
          exists: true,
          name: pattern,
          filePath: apiFile,
          methods: this.extractAPIMethods(content),
          hasErrorHandling: content.includes("catch") || content.includes("try"),
          hasAuth:
            content.includes("auth") ||
            content.includes("token") ||
            content.includes("Authorization"),
        };
      }
    }

    // 检测是否使用 axios 或其他库（暂时跳过异步检测）
    return {
      exists: false,
      hasErrorHandling: false,
      hasAuth: false,
    };
  }

  /**
   * 统计在项目中的使用次数（只扫描源码文件，排除 dist/node_modules）
   */
  private async countUsageInProject(
    name: string,
    files: string[]
  ): Promise<number> {
    let count = 0;
    const sourceFiles = files.filter(
      (f) =>
        /\.(ts|tsx|js|jsx|vue|svelte)$/.test(f) &&
        !/[\\/](dist|build|node_modules|\.cache)[\\/]/.test(f)
    );
    const sampleSize = Math.min(300, sourceFiles.length);
    const sampleFiles = sourceFiles.slice(0, sampleSize);

    for (const file of sampleFiles) {
      const content = await FileUtils.readFile(file);
      const matches = content.match(new RegExp(`\\b${name}\\b`, "g"));
      if (matches) {
        count += matches.length;
      }
    }

    return count;
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
      return "日期时间";
    if (basename.includes("format")) return "格式化";
    if (basename.includes("valid")) return "验证";
    if (basename.includes("api") || basename.includes("http"))
      return "API 调用";
    if (basename.includes("storage")) return "存储";
    if (basename.includes("auth")) return "认证";
    if (dirname.includes("validation")) return "验证";
    if (dirname.includes("formatting")) return "格式化";

    return "通用工具";
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

