import * as path from 'path';

import { FileUtils } from '../../utils/file-utils.js';
import { logger } from '../../utils/logger.js';

/**
 * 配置文件解析器
 * 解析项目的各种配置文件，提取代码风格和规范
 */

export interface PrettierConfig {
  tabWidth?: number;
  useTabs?: boolean;
  semi?: boolean;
  singleQuote?: boolean;
  printWidth?: number;
  trailingComma?: "none" | "es5" | "all";
  bracketSpacing?: boolean;
  arrowParens?: "always" | "avoid";
}

export interface ESLintConfig {
  rules?: Record<string, any>;
  extends?: string[];
  parser?: string;
  parserOptions?: Record<string, any>;
}

export interface TSConfig {
  compilerOptions?: {
    strict?: boolean;
    target?: string;
    module?: string;
    paths?: Record<string, string[]>;
    baseUrl?: string;
    [key: string]: any;
  };
}

export interface ProjectConfig {
  prettier?: PrettierConfig;
  eslint?: ESLintConfig;
  typescript?: TSConfig;
  pathAliases: Record<string, string>;
  hasConfig: {
    prettier: boolean;
    eslint: boolean;
    typescript: boolean;
  };
  commands?: {
    build?: string;
    dev?: string;
    start?: string;
    test?: string;
    format?: string;
    lint?: string;
    lintFix?: string;
    typeCheck?: string;
  };
}

export class ConfigParser {
  /**
   * 解析项目配置
   */
  async parseProjectConfig(projectPath: string): Promise<ProjectConfig> {
    const config: ProjectConfig = {
      pathAliases: {},
      hasConfig: {
        prettier: false,
        eslint: false,
        typescript: false,
      },
    };

    // 解析 Prettier 配置
    config.prettier = await this.parsePrettierConfig(projectPath);
    config.hasConfig.prettier = config.prettier !== undefined;

    // 解析 ESLint 配置
    config.eslint = await this.parseESLintConfig(projectPath);
    config.hasConfig.eslint = config.eslint !== undefined;

    // 解析 TypeScript 配置
    config.typescript = await this.parseTSConfig(projectPath);
    config.hasConfig.typescript = config.typescript !== undefined;

    // 提取路径别名
    config.pathAliases = await this.extractPathAliases(projectPath);

    // v1.3.4: 检测格式化命令
    config.commands = await this.detectFormattingCommands(projectPath);

    return config;
  }

  /**
   * 检测项目的格式化和 lint 命令
   */
  private async detectFormattingCommands(projectPath: string): Promise<{
    build?: string;
    dev?: string;
    start?: string;
    test?: string;
    format?: string;
    lint?: string;
    lintFix?: string;
    typeCheck?: string;
  }> {
    const packageJsonPath = path.join(projectPath, "package.json");
    if (!(await FileUtils.fileExists(packageJsonPath))) {
      return {};
    }

    const content = await FileUtils.readFile(packageJsonPath);
    const pkg = JSON.parse(content);

    if (!pkg.scripts) {
      return {};
    }

    const runPrefix = await this.detectRunPrefix(projectPath);
    const commands: Record<string, string | undefined> = {};

    commands.build = this.findCommand(pkg.scripts, ["build", "compile"], runPrefix);
    commands.dev = this.findCommand(pkg.scripts, ["dev", "serve", "watch"], runPrefix);
    commands.start = this.findCommand(pkg.scripts, ["start", "preview"], runPrefix);
    commands.test = this.findCommand(pkg.scripts, ["test", "vitest", "jest"], runPrefix);
    commands.format = this.findCommand(pkg.scripts, ["format", "prettier", "fmt"], runPrefix);
    commands.lint = this.findCommand(pkg.scripts, ["lint", "eslint"], runPrefix);
    commands.lintFix = this.findCommand(pkg.scripts, ["lint:fix", "eslint:fix", "fix"], runPrefix);
    commands.typeCheck = this.findCommand(pkg.scripts, ["type-check", "typecheck", "tsc"], runPrefix);

    return commands;
  }

  /**
   * 查找匹配的命令
   */
  private findCommand(
    scripts: Record<string, string>,
    keywords: string[],
    runPrefix = "npm run"
  ): string | undefined {
    for (const keyword of keywords) {
      if (scripts[keyword]) {
        return `${runPrefix} ${keyword}`;
      }
    }

    for (const [key, value] of Object.entries(scripts)) {
      if (keywords.some((kw) => value.toLowerCase().includes(kw))) {
        return `${runPrefix} ${key}`;
      }
    }

    return undefined;
  }

  private async detectRunPrefix(projectPath: string): Promise<string> {
    const lockFiles: [string, string][] = [
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["bun.lockb", "bun"],
    ];
    for (const [file, prefix] of lockFiles) {
      if (await FileUtils.fileExists(path.join(projectPath, file))) {
        return `${prefix} run`;
      }
    }
    return "npm run";
  }

  /**
   * 解析 Prettier 配置
   */
  private async parsePrettierConfig(
    projectPath: string
  ): Promise<PrettierConfig | undefined> {
    // 尝试读取 .prettierrc
    const prettierrcPath = path.join(projectPath, ".prettierrc");
    if (await FileUtils.fileExists(prettierrcPath)) {
      const content = await FileUtils.readFile(prettierrcPath);
      try {
        return JSON.parse(content);
      } catch {
        // YAML 格式，暂不支持
      }
    }

    // 尝试读取 .prettierrc.json
    const prettierrcJsonPath = path.join(projectPath, ".prettierrc.json");
    if (await FileUtils.fileExists(prettierrcJsonPath)) {
      const content = await FileUtils.readFile(prettierrcJsonPath);
      try {
        return JSON.parse(content);
      } catch {}
    }

    // 尝试从 package.json 读取
    const packageJsonPath = path.join(projectPath, "package.json");
    if (await FileUtils.fileExists(packageJsonPath)) {
      const content = await FileUtils.readFile(packageJsonPath);
      try {
        const pkg = JSON.parse(content);
        if (pkg.prettier) {
          return pkg.prettier;
        }
      } catch {}
    }

    return undefined;
  }

  /**
   * 解析 ESLint 配置
   */
  private async parseESLintConfig(
    projectPath: string
  ): Promise<ESLintConfig | undefined> {
    // 尝试读取 .eslintrc.json
    const eslintrcJsonPath = path.join(projectPath, ".eslintrc.json");
    if (await FileUtils.fileExists(eslintrcJsonPath)) {
      const content = await FileUtils.readFile(eslintrcJsonPath);
      try {
        return JSON.parse(content);
      } catch {}
    }

    // 尝试读取 .eslintrc
    const eslintrcPath = path.join(projectPath, ".eslintrc");
    if (await FileUtils.fileExists(eslintrcPath)) {
      const content = await FileUtils.readFile(eslintrcPath);
      try {
        return JSON.parse(content);
      } catch {}
    }

    // 尝试从 package.json 读取
    const packageJsonPath = path.join(projectPath, "package.json");
    if (await FileUtils.fileExists(packageJsonPath)) {
      const content = await FileUtils.readFile(packageJsonPath);
      try {
        const pkg = JSON.parse(content);
        if (pkg.eslintConfig) {
          return pkg.eslintConfig;
        }
      } catch {}
    }

    return undefined;
  }

  /**
   * 解析 TypeScript 配置
   */
  private async parseTSConfig(
    projectPath: string
  ): Promise<TSConfig | undefined> {
    const tsconfigPath = path.join(projectPath, "tsconfig.json");
    if (await FileUtils.fileExists(tsconfigPath)) {
      const content = await FileUtils.readFile(tsconfigPath);
      try {
        // 移除注释（简单处理）
        const cleanContent = content
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "");
        return JSON.parse(cleanContent);
      } catch (error) {
        logger.debug("解析 tsconfig.json 失败", error);
      }
    }
    return undefined;
  }

  /**
   * 提取路径别名
   */
  private async extractPathAliases(
    projectPath: string
  ): Promise<Record<string, string>> {
    const aliases: Record<string, string> = {};

    // 从 tsconfig.json 提取
    const tsconfig = await this.parseTSConfig(projectPath);
    if (tsconfig?.compilerOptions?.paths) {
      const baseUrl = tsconfig.compilerOptions.baseUrl || ".";
      for (const [alias, paths] of Object.entries(
        tsconfig.compilerOptions.paths
      )) {
        if (paths && paths.length > 0) {
          // 移除通配符
          const cleanAlias = alias.replace("/*", "");
          const cleanPath = paths[0].replace("/*", "");
          aliases[cleanAlias] = path.join(baseUrl, cleanPath);
        }
      }
    }

    // 从 vite.config 提取
    const viteConfigPath = path.join(projectPath, "vite.config.ts");
    if (await FileUtils.fileExists(viteConfigPath)) {
      const content = await FileUtils.readFile(viteConfigPath);
      // 简单的正则提取 alias 配置
      const aliasMatch = content.match(/alias:\s*{([^}]+)}/);
      if (aliasMatch) {
        // 这里需要更复杂的解析，暂时跳过
      }
    }

    // 从 next.config 提取（暂时跳过，较复杂）

    return aliases;
  }

}
