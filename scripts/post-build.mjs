#!/usr/bin/env node
/**
 * 跨平台 post-build 脚本。
 *
 * 替代 package.json 中原先依赖 `chmod` 与 shell `echo` 的 build 命令——
 * 那种写法在 Windows / 受限的 CI shell 下会失败。本脚本完全使用 Node API。
 *
 * 任务：
 * 1. 写入 `dist/cli.js` shim：转发到编译产物 `dist/src/cli.js`。
 *    （bin/cursor-rules-gen 指向 `dist/cli.js`，所以需要这一层。）
 * 2. 给 `dist/index.js` 和 `dist/cli.js` 加上可执行权限（仅在 POSIX 平台）。
 */

import { writeFileSync, chmodSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const distDir = resolve(projectRoot, 'dist');

const shimContents = `#!/usr/bin/env node\nimport './src/cli.js';\n`;
const shimPath = resolve(distDir, 'cli.js');
writeFileSync(shimPath, shimContents, { encoding: 'utf8' });

if (platform() !== 'win32') {
  const executables = [
    resolve(distDir, 'index.js'),
    shimPath,
  ];
  for (const file of executables) {
    if (existsSync(file)) {
      chmodSync(file, 0o755);
    }
  }
}

console.log('post-build: wrote dist/cli.js shim');
