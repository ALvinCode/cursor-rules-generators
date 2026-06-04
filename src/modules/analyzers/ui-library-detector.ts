/**
 * UI 库真实使用检测器
 *
 * 区分"安装"与"真实使用"：
 * 1. 先从依赖中识别已安装的 UI 库
 * 2. 扫描源码，统计每个已安装 UI 库「含其 import 的文件数」作为使用程度
 * 3. 按阈值裁定项目真实使用的 UI 库：保留 fileCount ≥ 最大值/3 的库
 *    （某库使用范围远大于其它 → 只取该库；多个使用程度接近 → 都算）
 *
 * 遵循分析原则：基于真实代码用法判定，而非仅凭依赖是否安装。
 */

import * as path from "path";

import { Dependency, UILibraryAnalysis, UILibraryUsage } from "../../types.js";
import { FileUtils } from "../../utils/file-utils.js";
import { logger } from "../../utils/logger.js";

/**
 * 已知 UI 库清单：展示名 → 包名/前缀模式。
 * 以 `/` 结尾的视为前缀（匹配该 scope 下的任意子包）。
 */
const KNOWN_UI_LIBRARIES: Array<{ name: string; patterns: string[] }> = [
  { name: "Ant Design", patterns: ["antd", "@ant-design/", "antd-mobile"] },
  { name: "Material UI", patterns: ["@mui/", "@material-ui/"] },
  { name: "shadcn/ui (Radix)", patterns: ["@radix-ui/", "shadcn-ui"] },
  { name: "Chakra UI", patterns: ["@chakra-ui/"] },
  { name: "Mantine", patterns: ["@mantine/"] },
  { name: "Arco Design", patterns: ["@arco-design/"] },
  { name: "Element Plus", patterns: ["element-plus"] },
  { name: "Element UI", patterns: ["element-ui"] },
  { name: "Vuetify", patterns: ["vuetify"] },
  { name: "Naive UI", patterns: ["naive-ui"] },
  { name: "PrimeReact", patterns: ["primereact"] },
  { name: "PrimeVue", patterns: ["primevue"] },
  { name: "styled-components", patterns: ["styled-components"] },
  { name: "Emotion", patterns: ["@emotion/"] },
  // 注意：Tailwind 以 className 使用、极少出现在 import 中，import 文件数会低估；
  // 但通常与组件目录共存，由 ui-ux 触发的"组件目录"分支兜底。
  { name: "Tailwind CSS", patterns: ["tailwindcss"] },
];

const SOURCE_EXT = /\.(ts|tsx|js|jsx|vue|svelte)$/;
const EXCLUDE_DIR = /(^|\/)(node_modules|dist|build|out|coverage)(\/|$)/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 判断某依赖名是否匹配某 UI 库模式（精确包名或 scope 前缀）。
 */
function depMatchesPattern(depName: string, pattern: string): boolean {
  if (pattern.endsWith("/")) return depName.startsWith(pattern);
  return depName === pattern;
}

/**
 * 构造用于在源码中检测某模式 import 的正则。
 * 同时覆盖 ESM `from '...'` 与 CJS `require('...')`。
 */
function buildImportRegex(pattern: string): RegExp {
  const escaped = escapeRegExp(pattern);
  // 前缀模式（@scope/）后面可直接接子路径；精确包名后必须是引号或 `/`
  const tail = pattern.endsWith("/") ? "" : "['\"/]";
  return new RegExp(`(?:from\\s*|require\\(\\s*)['"]${escaped}${tail}`);
}

export class UILibraryDetector {
  /**
   * 检测项目真实使用的 UI 库。
   */
  async detect(
    projectPath: string,
    files: string[],
    dependencies: Dependency[]
  ): Promise<UILibraryAnalysis> {
    // 1. 识别已安装的 UI 库
    const depNames = dependencies.map((d) => d.name);
    const installedLibs = KNOWN_UI_LIBRARIES.filter((lib) =>
      lib.patterns.some((p) => depNames.some((d) => depMatchesPattern(d, p)))
    );

    if (installedLibs.length === 0) {
      return { installed: [], active: [] };
    }

    // 2. 扫描源码，统计每个已安装库「含其 import 的文件数」
    const regexByLib = installedLibs.map((lib) => ({
      name: lib.name,
      pkg: lib.patterns[0],
      regexes: lib.patterns.map(buildImportRegex),
      fileCount: 0,
    }));

    const sourceFiles = files.filter(
      (f) => SOURCE_EXT.test(f) && !EXCLUDE_DIR.test(f)
    );

    for (const file of sourceFiles) {
      let content: string;
      try {
        const abs = path.isAbsolute(file) ? file : path.join(projectPath, file);
        content = await FileUtils.readFile(abs);
      } catch {
        // 单个文件读取失败时跳过，不影响整体统计
        continue;
      }
      for (const lib of regexByLib) {
        if (lib.regexes.some((re) => re.test(content))) {
          lib.fileCount += 1;
        }
      }
    }

    const installed: UILibraryUsage[] = regexByLib
      .map((l) => ({ name: l.name, pkg: l.pkg, fileCount: l.fileCount }))
      .sort((a, b) => b.fileCount - a.fileCount);

    // 3. 按使用程度阈值裁定真实使用的 UI 库
    const used = installed.filter((l) => l.fileCount > 0);
    let active: UILibraryUsage[] = [];
    if (used.length > 0) {
      const maxFileCount = used[0].fileCount; // 已降序
      // 保留 fileCount ≥ 最大值/3 的库：悬殊则只取主库，接近则都算
      active = used.filter((l) => l.fileCount >= maxFileCount / 3);
    }

    logger.info("UI 库使用分析完成", {
      installed: installed.map((l) => `${l.name}(${l.fileCount})`),
      active: active.map((l) => l.name),
    });

    return { installed, active };
  }
}
