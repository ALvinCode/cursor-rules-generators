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
  rules?: Record<string, unknown>;
  extends?: string[];
  parser?: string;
  parserOptions?: Record<string, unknown>;
}

export interface TSConfig {
  compilerOptions?: {
    strict?: boolean;
    target?: string;
    module?: string;
    paths?: Record<string, string[]>;
    baseUrl?: string;
    [key: string]: unknown;
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
  commitConvention?: string;
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

    // Detect commit convention (commitlint)
    config.commitConvention = await this.detectCommitConvention(projectPath);

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

    // Fallback: if no standalone typeCheck script was found, extract `tsc --noEmit`
    // from composite commands (e.g. "tsc --noEmit && vite") as a direct invocation
    if (!commands.typeCheck) {
      for (const value of Object.values(pkg.scripts)) {
        const match = (value as string).match(/\b((?:vue-)?tsc\s+--noEmit)\b/);
        if (match) {
          commands.typeCheck = match[1];
          break;
        }
      }
    }

    return commands;
  }

  /**
   * 查找匹配的命令
   */
  /**
   * 判断一个脚本命令值是否"以测试运行为唯一目的"。
   *
   * 原则：禁止仅从脚本 alias 推测用途，必须读取实际执行命令判断。
   * 常见误匹配：
   *   - prepare = "test -z \"$CI\" && husky install"  → Unix shell test 工具，非测试运行器
   *   - npm lifecycle 钩子（prepare, prepublish 等）不参与语义匹配
   */
  private isPureTestCommand(scriptKey: string, scriptValue: string): boolean {
    // npm lifecycle hooks 永远不是测试命令
    const NPM_LIFECYCLE_HOOKS = new Set([
      'prepare', 'prepublish', 'prepublishOnly', 'postpublish',
      'preinstall', 'postinstall', 'preuninstall', 'postuninstall',
      'prepack', 'postpack',
    ]);
    if (NPM_LIFECYCLE_HOOKS.has(scriptKey.toLowerCase())) return false;

    const v = scriptValue.trim().toLowerCase();

    // Unix shell test 工具（test -z / test -n / [ -x / [[ ）不是测试运行器
    if (/^test\s+-[a-z]/i.test(v) || /^\[\s*-/.test(v) || /^\[\[/.test(v)) return false;

    // 必须含真实测试运行器关键词
    const hasTestRunner = /\b(jest|vitest|mocha|jasmine|cypress|playwright|karma|ava)\b/.test(v)
      || /\bnpm\s+test\b|\byarn\s+test\b|\bpnpm\s+test\b/.test(v); // 间接调用

    return hasTestRunner;
  }

  /**
   * 判断一个脚本命令值是否"以类型检查为唯一目的"。
   *
   * 原则：禁止仅从脚本 alias 推测用途，必须读取实际执行命令判断。
   * - 包含 tsc/vue-tsc 但同时启动了 dev server → 复合命令，主目的不是类型检查
   * - 只运行 tsc/vue-tsc（可带 --noEmit / --watch 等参数）→ 是类型检查
   */
  private isPureTypeCheckCommand(scriptValue: string): boolean {
    const v = scriptValue.toLowerCase();
    // 必须含类型检查工具
    const hasTypeChecker = /\btsc\b|\bvue-tsc\b/.test(v);
    if (!hasTypeChecker) return false;
    // 含 dev-server 工具则判定为复合命令（主目的是开发服务，不是类型检查）
    const hasDevServer = /\bvite\b|\bwebpack(-dev-server)?\b|\bnext\s+dev\b|\bnuxt\s+dev\b|\breact-scripts\s+start\b|\bts-node\b|\bnode\s+/.test(v);
    return !hasDevServer;
  }

  private findCommand(
    scripts: Record<string, string>,
    keywords: string[],
    runPrefix = "npm run"
  ): string | undefined {
    // 1. 精确 key 匹配（优先级最高）
    for (const keyword of keywords) {
      if (scripts[keyword]) {
        return `${runPrefix} ${keyword}`;
      }
    }

    // 2. 值匹配：必须读取实际命令值判断用途，不能从脚本名称推测
    // typeCheck 专项：命令值必须以类型检查为唯一目的（不能同时启动 dev server）
    const isTypeCheckSearch = keywords.some(kw => ['tsc', 'type-check', 'typecheck', 'vue-tsc'].includes(kw));
    // test 专项：命令值必须调用真实测试运行器，且 key 不能是 npm lifecycle 钩子
    const isTestSearch = keywords.some(kw => ['test', 'jest', 'vitest', 'mocha'].includes(kw));
    for (const [key, value] of Object.entries(scripts)) {
      if (isTypeCheckSearch) {
        if (this.isPureTypeCheckCommand(value)) {
          return `${runPrefix} ${key}`;
        }
      } else if (isTestSearch) {
        if (this.isPureTestCommand(key, value)) {
          return `${runPrefix} ${key}`;
        }
      } else {
        if (keywords.some((kw) => value.toLowerCase().includes(kw))) {
          return `${runPrefix} ${key}`;
        }
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
      } catch (error) {
        logger.debug("解析 .prettierrc 失败（可能为 YAML 格式）", { error });
      }
    }

    // 尝试读取 .prettierrc.json
    const prettierrcJsonPath = path.join(projectPath, ".prettierrc.json");
    if (await FileUtils.fileExists(prettierrcJsonPath)) {
      const content = await FileUtils.readFile(prettierrcJsonPath);
      try {
        return JSON.parse(content);
      } catch (error) {
        logger.debug("解析 .prettierrc.json 失败", { error });
      }
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
      } catch (error) {
        logger.debug("从 package.json 解析 prettier 配置失败", { error });
      }
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
      } catch (error) {
        logger.debug("解析 .eslintrc.json 失败", { error });
      }
    }

    // 尝试读取 .eslintrc
    const eslintrcPath = path.join(projectPath, ".eslintrc");
    if (await FileUtils.fileExists(eslintrcPath)) {
      const content = await FileUtils.readFile(eslintrcPath);
      try {
        return JSON.parse(content);
      } catch (error) {
        logger.debug("解析 .eslintrc 失败", { error });
      }
    }

    // 尝试读取 .eslintrc.cjs / .eslintrc.js（CommonJS/ESM — regex 提取 rules 子集）
    for (const ext of [".cjs", ".js"]) {
      const eslintJsPath = path.join(projectPath, `.eslintrc${ext}`);
      if (await FileUtils.fileExists(eslintJsPath)) {
        const content = await FileUtils.readFile(eslintJsPath);
        const rules = this.extractRulesFromJsConfig(content);
        if (rules && Object.keys(rules).length > 0) {
          return { rules };
        }
      }
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
      } catch (error) {
        logger.debug("从 package.json 解析 eslintConfig 失败", { error });
      }
    }

    return undefined;
  }

  /**
   * Best-effort rule extraction from .eslintrc.cjs/.js via regex.
   * Only captures simple `"rule-name": "off"` / `"rule-name": 0` patterns.
   */
  private extractRulesFromJsConfig(content: string): Record<string, unknown> | null {
    // Scan the entire file for simple rule entries (handles nested braces in rules block)
    const rules: Record<string, unknown> = {};
    const rulePattern = /["'](@?[\w/-]+)["']\s*:\s*["']?(off|warn|error|\d)["']?/g;
    let m: RegExpExecArray | null;
    while ((m = rulePattern.exec(content)) !== null) {
      const value = m[2];
      rules[m[1]] = value === "0" ? 0 : value === "1" ? 1 : value === "2" ? 2 : value;
    }
    return Object.keys(rules).length > 0 ? rules : null;
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
        return JSON.parse(content);
      } catch {
        // Fallback: tsconfig.json may be JSONC (comments, trailing commas).
        // Protect string literals from the block-comment regex (`/*` in paths
        // like `"@/*"` would otherwise be treated as a comment start).
        try {
          const placeholders: string[] = [];
          let processed = content.replace(/"(?:[^"\\]|\\.)*"/g, (m) => {
            placeholders.push(m);
            return `"__S${placeholders.length - 1}__"`;
          });
          processed = processed
            .replace(/\/\/.*$/gm, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
          processed = processed.replace(/"__S(\d+)__"/g, (_, i) => placeholders[Number(i)]);
          processed = processed.replace(/,\s*([\]}])/g, "$1");
          return JSON.parse(processed);
        } catch (error) {
          logger.debug("解析 tsconfig.json 失败", error);
        }
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

    // 从 vite.config.ts/.js 提取 resolve.alias
    for (const viteExt of ["vite.config.ts", "vite.config.js", "vite.config.mts"]) {
      const viteConfigPath = path.join(projectPath, viteExt);
      if (await FileUtils.fileExists(viteConfigPath)) {
        const content = await FileUtils.readFile(viteConfigPath);
        const aliasMatch = content.match(/alias\s*:\s*\{([\s\S]*?)\}/);
        if (aliasMatch) {
          const block = aliasMatch[1];
          // Match quoted or unquoted keys: 'name'/name: path.resolve(..., 'dir') or 'dir'
          const entryRe = /(?:['"]([^'"]+)['"]|(\w+))\s*:\s*(?:path\.resolve\s*\([^,]*,\s*['"]([^'"]+)['"]\)|['"]([^'"]+)['"])/g;
          let m: RegExpExecArray | null;
          while ((m = entryRe.exec(block)) !== null) {
            const aliasName = m[1] || m[2];
            const aliasTarget = (m[3] || m[4]).replace(/^\.\//, '');
            if (aliasName && aliasTarget && !aliases[aliasName] && !aliasTarget.includes('node_modules')) {
              aliases[aliasName] = aliasTarget;
            }
          }
        }
        break;
      }
    }

    return aliases;
  }

  private async detectCommitConvention(projectPath: string): Promise<string | undefined> {
    const pkgPath = path.join(projectPath, "package.json");
    if (!(await FileUtils.fileExists(pkgPath))) return undefined;
    const content = await FileUtils.readFile(pkgPath);
    try {
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["@commitlint/cli"] || deps["commitlint"]) {
        const configPkg = Object.keys(deps).find(
          (d) => d.includes("commitlint-config") || d === "@commitlint/config-conventional"
        );
        return configPkg ? "conventional-commits" : "commitlint";
      }
    } catch {
      // ignore
    }
    return undefined;
  }

}
