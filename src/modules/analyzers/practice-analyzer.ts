import * as path from "path";
import { FileUtils } from "../../utils/file-utils.js";

/**
 * 项目实践分析器
 * 分析项目中实际使用的开发模式和习惯
 */

export interface ErrorHandlingPattern {
  type: "try-catch" | "promise-catch" | "callback" | "none";
  frequency: number;
  examples: string[];
  customErrorTypes: string[];
  loggingMethod: "console" | "logger-library" | "none";
  loggerLibrary?: string;
}

export interface CodeStylePattern {
  variableDeclaration: "const-let" | "var" | "mixed";
  functionStyle: "arrow" | "function" | "mixed";
  stringQuote: "single" | "double" | "backtick" | "mixed";
  semicolon: "always" | "never" | "mixed";
  indentation: { type: "spaces" | "tabs"; size: number };
  lineLength: number;
}

export interface ComponentPattern {
  type: "functional" | "class" | "mixed";
  exportStyle: "named" | "default" | "mixed";
  propsType: "interface" | "type" | "mixed" | "none";
  stateManagement: string[]; // ['useState', 'useReducer', 'redux']
}

export class PracticeAnalyzer {
  /**
   * 分析项目的错误处理模式
   */
  async analyzeErrorHandling(
    projectPath: string,
    files: string[]
  ): Promise<ErrorHandlingPattern> {
    const codeFiles = files.filter((f) =>
      /\.(ts|tsx|js|jsx|py)$/.test(f)
    );

    let tryCatchCount = 0;
    let promiseCatchCount = 0;
    const customErrorTypes = new Set<string>();
    let loggingMethod: "console" | "logger-library" | "none" = "none";
    let loggerLibrary: string | undefined;

    const sampleFiles = codeFiles.slice(0, Math.min(50, codeFiles.length));

    for (const file of sampleFiles) {
      const content = await FileUtils.readFile(file);

      // 检测 try-catch
      const tryCatchMatches = content.match(/try\s*{/g);
      if (tryCatchMatches) {
        tryCatchCount += tryCatchMatches.length;
      }

      // 检测 .catch()
      const promiseCatchMatches = content.match(/\.catch\(/g);
      if (promiseCatchMatches) {
        promiseCatchCount += promiseCatchMatches.length;
      }

      // 检测自定义错误类型
      const errorClassMatches = content.match(
        /class\s+(\w+Error)\s+extends\s+Error/g
      );
      if (errorClassMatches) {
        errorClassMatches.forEach((match) => {
          const errorType = match.match(/class\s+(\w+Error)/)?.[1];
          if (errorType) customErrorTypes.add(errorType);
        });
      }

      // 检测日志方式
      if (content.includes("console.log") || content.includes("console.error")) {
        loggingMethod = "console";
      }

      // 检测日志库
      if (content.includes("winston") || content.includes("import winston")) {
        loggingMethod = "logger-library";
        loggerLibrary = "winston";
      } else if (content.includes("pino")) {
        loggingMethod = "logger-library";
        loggerLibrary = "pino";
      } else if (content.includes("logger.")) {
        loggingMethod = "logger-library";
        loggerLibrary = "custom";
      }
    }

    const totalErrorHandling = tryCatchCount + promiseCatchCount;
    const primaryType =
      tryCatchCount > promiseCatchCount ? "try-catch" : "promise-catch";

    return {
      type: totalErrorHandling > 0 ? primaryType : "none",
      frequency: totalErrorHandling,
      examples: [],
      customErrorTypes: Array.from(customErrorTypes),
      loggingMethod,
      loggerLibrary,
    };
  }

  /**
   * 分析代码风格模式
   */
  async analyzeCodeStyle(
    projectPath: string,
    files: string[]
  ): Promise<CodeStylePattern> {
    const jsFiles = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
    const sampleFiles = jsFiles.slice(0, Math.min(30, jsFiles.length));

    let constLetCount = 0;
    let varCount = 0;
    let arrowFuncCount = 0;
    let regularFuncCount = 0;
    let singleQuoteCount = 0;
    let doubleQuoteCount = 0;
    let withSemiCount = 0;
    let withoutSemiCount = 0;

    let indentSpaces = 0;
    let indentTabs = 0;
    let totalIndentSamples = 0;

    for (const file of sampleFiles) {
      const content = await FileUtils.readFile(file);
      const lines = content.split("\n");

      // 分析变量声明
      constLetCount += (content.match(/\b(const|let)\s+/g) || []).length;
      varCount += (content.match(/\bvar\s+/g) || []).length;

      // 分析函数风格
      arrowFuncCount += (content.match(/=>\s*[{(]/g) || []).length;
      regularFuncCount += (content.match(/\bfunction\s+\w+/g) || []).length;

      // 分析引号（只统计字符串字面量）
      singleQuoteCount += (content.match(/'[^']*'/g) || []).length;
      doubleQuoteCount += (content.match(/"[^"]*"/g) || []).length;

      // 分析分号
      const statements = content.split("\n").filter((line) => line.trim());
      for (const stmt of statements) {
        if (stmt.trim().endsWith(";")) withSemiCount++;
        else if (
          stmt.trim() &&
          !stmt.trim().endsWith("{") &&
          !stmt.trim().endsWith("}")
        ) {
          withoutSemiCount++;
        }
      }

      // 分析缩进（取前10行非空行）
      const nonEmptyLines = lines.filter((l) => l.trim()).slice(0, 10);
      for (const line of nonEmptyLines) {
        const match = line.match(/^(\s+)/);
        if (match) {
          const indent = match[1];
          if (indent.includes("\t")) {
            indentTabs++;
          } else {
            indentSpaces++;
            // 暂不分析空格数量，使用配置文件更准确
          }
          totalIndentSamples++;
        }
      }
    }

    return {
      variableDeclaration:
        constLetCount > varCount * 2
          ? "const-let"
          : varCount > constLetCount * 2
          ? "var"
          : "mixed",
      functionStyle:
        arrowFuncCount > regularFuncCount * 2
          ? "arrow"
          : regularFuncCount > arrowFuncCount * 2
          ? "function"
          : "mixed",
      stringQuote:
        singleQuoteCount > doubleQuoteCount * 2
          ? "single"
          : doubleQuoteCount > singleQuoteCount * 2
          ? "double"
          : "mixed",
      semicolon:
        withSemiCount > withoutSemiCount * 2
          ? "always"
          : withoutSemiCount > withSemiCount * 2
          ? "never"
          : "mixed",
      indentation: {
        type: indentTabs > indentSpaces ? "tabs" : "spaces",
        size: 2, // 默认，配置文件会覆盖
      },
      lineLength: 100, // 默认，配置文件会覆盖
    };
  }

  /**
   * 分析组件模式
   */
  async analyzeComponentPatterns(
    projectPath: string,
    files: string[]
  ): Promise<ComponentPattern> {
    const componentFiles = files.filter(
      (f) =>
        (f.includes("/components/") || f.match(/[A-Z][a-zA-Z]+\.(tsx?|jsx)$/)) &&
        /\.(tsx?|jsx)$/.test(f)
    );

    let functionalCount = 0;
    let classCount = 0;
    let namedExportCount = 0;
    let defaultExportCount = 0;
    const stateManagementMethods = new Set<string>();

    const sampleFiles = componentFiles.slice(
      0,
      Math.min(20, componentFiles.length)
    );

    for (const file of sampleFiles) {
      const content = await FileUtils.readFile(file);

      // 检测组件类型
      if (
        content.match(/const\s+\w+\s*[:=]\s*\(.*\)\s*=>/)) {
        functionalCount++;
      } else if (content.match(/class\s+\w+\s+extends\s+(React\.)?Component/)) {
        classCount++;
      }

      // 检测导出方式
      if (content.match(/export\s+(const|function)\s+/)) {
        namedExportCount++;
      }
      if (content.match(/export\s+default/)) {
        defaultExportCount++;
      }

      // 检测状态管理
      if (content.includes("useState")) stateManagementMethods.add("useState");
      if (content.includes("useReducer"))
        stateManagementMethods.add("useReducer");
      if (content.includes("useContext"))
        stateManagementMethods.add("useContext");
      if (content.includes("useDispatch"))
        stateManagementMethods.add("redux");
      if (content.includes("usePinia")) stateManagementMethods.add("pinia");
    }

    return {
      type:
        functionalCount > classCount * 2
          ? "functional"
          : classCount > functionalCount * 2
          ? "class"
          : "mixed",
      exportStyle:
        namedExportCount > defaultExportCount
          ? "named"
          : defaultExportCount > namedExportCount
          ? "default"
          : "mixed",
      propsType: "interface", // 需要更深入分析
      stateManagement: Array.from(stateManagementMethods),
    };
  }
}

