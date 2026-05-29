/**
 * 解析与"包安装位置"相关的路径。
 *
 * 为什么需要这个工具：
 * 这个项目以 npm 包形式分发，全局安装或 npx 调用时 `process.cwd()` 指向
 * **用户的项目目录**，而不是包自身的安装目录。因此任何打包进 npm 的资源
 * （如 `docs/story/awesome-cursorrules-samples/`）必须通过 `import.meta.url`
 * 反推包根，而不能用 `process.cwd()`。
 */

import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

let cachedPackageRoot: string | null = null;

/**
 * 校验 package.json 是否属于本包（name === 'cursor-rules-generators'）。
 * 避免在 monorepo 等嵌套场景中误取上层包的 package.json。
 */
function isOwnPackageJson(pkgPath: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
    return pkg.name === 'cursor-rules-generators';
  } catch {
    return false;
  }
}

/**
 * 返回本包的根目录（即包含 package.json 的目录）。
 *
 * 实现策略：从当前模块文件出发，向上查找直到找到 package.json，且其 name
 * 字段匹配本包。这种方式同时支持源码运行（`src/utils/package-paths.ts`）
 * 与编译产物运行（`dist/src/utils/package-paths.js`）。
 */
export function getPackageRoot(): string {
  if (cachedPackageRoot) return cachedPackageRoot;

  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  // 最多向上回溯 6 层，覆盖 src/utils → 项目根、dist/src/utils → 项目根。
  for (let i = 0; i < 6; i += 1) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath) && isOwnPackageJson(pkgPath)) {
      cachedPackageRoot = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 兜底：退回到模块所在目录（不应正常发生，发出告警由调用方处理）。
  cachedPackageRoot = here;
  return here;
}

/**
 * 解析包内打包资源的绝对路径。
 *
 * @example
 *   resolvePackageResource('docs', 'story', 'awesome-cursorrules-samples')
 */
export function resolvePackageResource(...segments: string[]): string {
  return resolve(getPackageRoot(), ...segments);
}
