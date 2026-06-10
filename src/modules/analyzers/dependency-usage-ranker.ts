/**
 * 依赖真实使用程度排名器（通用）
 *
 * 通用管线：给定一组"已知库清单"，从项目依赖中筛出已安装的库，
 * 扫描源码统计各库被引用的文件数，按阈值裁定真实使用的库。
 *
 * 覆盖的引用方式：
 * - ESM 静态 import (`import ... from 'pkg'`)
 * - CJS require (`require('pkg')`)
 * - 动态 import (`import('pkg')`)
 * - CSS/Less/SCSS @import (`@import '~pkg/...'`)
 * - 文件存在性兜底（如 Tailwind 的 tailwind.config.*）
 *
 * 使用方只需提供 catalog + config 即可复用整套管线。
 */

import * as path from "path";

import { FileUtils } from "../../utils/file-utils.js";

// ─── 公共类型 ────────────────────────────────────────────────────

/** 库清单条目：展示名 + 包名/前缀模式。以 `/` 结尾视为 scope 前缀。 */
export interface LibraryCatalogEntry {
  name: string;
  patterns: string[];
}

/** 单个库的使用情况。 */
export interface LibraryUsage {
  name: string;
  pkg: string;
  fileCount: number;
}

/** 排名结果。 */
export interface UsageRankResult {
  installed: LibraryUsage[];
  active: LibraryUsage[];
}

/**
 * 特殊库的文件存在性兜底规则。
 * 当某库通过正则扫描 fileCount 为 0 时，若项目中存在匹配 `filePattern` 的文件，
 * 则视为使用（fileCount = 1）。典型场景：Tailwind CSS 靠 tailwind.config.* 判定。
 */
export interface UsageFallback {
  libraryName: string;
  filePattern: RegExp;
}

/** 排名配置。 */
export interface RankConfig {
  /** 要扫描的文件后缀正则 */
  sourceExtensions: RegExp;
  /** 排除目录正则（默认排除 node_modules/dist/build/out/coverage） */
  excludeDirs?: RegExp;
  /** 活跃库的阈值比例：fileCount ≥ maxFileCount * threshold 即算活跃。默认 1/3。 */
  activationThreshold?: number;
  /** 特殊库的文件存在性兜底 */
  fallbacks?: UsageFallback[];
}

// ─── 内部工具 ────────────────────────────────────────────────────

const DEFAULT_EXCLUDE_DIR = /(^|\/)(node_modules|dist|build|out|coverage)(\/|$)/;
const DEFAULT_ACTIVATION_THRESHOLD = 1 / 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function depMatchesPattern(depName: string, pattern: string): boolean {
  if (pattern.endsWith("/")) return depName.startsWith(pattern);
  return depName === pattern;
}

/**
 * 为单个包名模式构造多种引用方式的正则。
 */
function buildUsageRegexes(pattern: string): RegExp[] {
  const escaped = escapeRegExp(pattern);
  const tail = pattern.endsWith("/") ? "" : "['\"/]";
  return [
    new RegExp(`(?:from\\s*|require\\(\\s*)['"]${escaped}${tail}`),
    new RegExp(`import\\(\\s*['"]${escaped}${tail}`),
    new RegExp(`@import\\s+['"]~?${escaped}`),
  ];
}

// ─── 核心函数 ────────────────────────────────────────────────────

/**
 * 对给定的库清单，统计项目中各库的真实使用程度并排名。
 *
 * @param catalog   已知库清单
 * @param projectPath 项目根路径
 * @param files     项目文件列表（相对或绝对路径）
 * @param depNames  项目依赖名列表（`dependencies.map(d => d.name)`）
 * @param config    扫描配置
 * @returns 安装列表 + 活跃列表
 */
export async function rankDependencyUsage(
  catalog: LibraryCatalogEntry[],
  projectPath: string,
  files: string[],
  depNames: string[],
  config: RankConfig,
): Promise<UsageRankResult> {
  const excludeDirs = config.excludeDirs ?? DEFAULT_EXCLUDE_DIR;
  const threshold = config.activationThreshold ?? DEFAULT_ACTIVATION_THRESHOLD;

  // 1. 筛出已安装的库
  const installedLibs = catalog.filter((lib) =>
    lib.patterns.some((p) => depNames.some((d) => depMatchesPattern(d, p))),
  );

  if (installedLibs.length === 0) {
    return { installed: [], active: [] };
  }

  // 2. 构建检测正则
  const regexByLib = installedLibs.map((lib) => ({
    name: lib.name,
    pkg: lib.patterns[0],
    regexes: lib.patterns.flatMap(buildUsageRegexes),
    fileCount: 0,
  }));

  // 3. 扫描文件，统计引用文件数
  const sourceFiles = files.filter(
    (f) => config.sourceExtensions.test(f) && !excludeDirs.test(f),
  );

  for (const file of sourceFiles) {
    let content: string;
    try {
      const abs = path.isAbsolute(file) ? file : path.join(projectPath, file);
      content = await FileUtils.readFile(abs);
    } catch {
      continue;
    }
    for (const lib of regexByLib) {
      if (lib.regexes.some((re) => re.test(content))) {
        lib.fileCount += 1;
      }
    }
  }

  // 4. 文件存在性兜底
  if (config.fallbacks) {
    for (const fb of config.fallbacks) {
      const lib = regexByLib.find((l) => l.name === fb.libraryName);
      if (lib && lib.fileCount === 0) {
        const hasFile = files.some(
          (f) => fb.filePattern.test(f) && !excludeDirs.test(f),
        );
        if (hasFile) {
          lib.fileCount = 1;
        }
      }
    }
  }

  const installed: LibraryUsage[] = regexByLib
    .map((l) => ({ name: l.name, pkg: l.pkg, fileCount: l.fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount);

  // 5. 按阈值裁定活跃库
  const used = installed.filter((l) => l.fileCount > 0);
  let active: LibraryUsage[] = [];
  if (used.length > 0) {
    const maxFileCount = used[0].fileCount;
    active = used.filter((l) => l.fileCount >= maxFileCount * threshold);
  }

  return { installed, active };
}
