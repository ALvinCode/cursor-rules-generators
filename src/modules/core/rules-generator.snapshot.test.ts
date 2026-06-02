/**
 * 规则生成快照测试（重构安全网）
 *
 * 目的：在拆分 `rules-generator.ts` 上帝类之前，锁定其对代表性项目的产出。
 * 重构（批 1-5）过程中，本快照必须保持零差异，以证明「纯结构重构、产出不变」。
 *
 * 设计：
 * - 每个 fixture 在临时目录里程序化构造一个最小但可被检测器识别的项目，
 *   走完整 AnalysisPipeline + RulesGenerator，再对全部规则文件做快照。
 * - 关闭 includeBestPractices，避免 Context7 网络调用导致快照不稳定。
 * - 项目根使用固定子目录名（fixture.name），使 `# <projectName>` 等输出稳定。
 */

import { describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { AnalysisPipeline } from './analysis-pipeline.js';
import { RulesGenerator } from './rules-generator.js';

interface Fixture {
  name: string;
  files: Record<string, string>;
}

const fixtures: Fixture[] = [
  {
    name: 'react-ts-app',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'react-ts-app',
          version: '1.0.0',
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
          devDependencies: { typescript: '^5.4.0', eslint: '^9.0.0' },
          scripts: {
            build: 'tsc',
            lint: 'eslint .',
            'type-check': 'tsc --noEmit',
          },
        },
        null,
        2
      ),
      'tsconfig.json': JSON.stringify(
        { compilerOptions: { strict: true, jsx: 'react-jsx', target: 'ES2020' } },
        null,
        2
      ),
      '.prettierrc': JSON.stringify({ singleQuote: true, semi: true }, null, 2),
      'src/App.tsx':
        "import { useCounter } from './hooks/useCounter';\n\n" +
        'export const App = () => {\n' +
        '  const { count, inc } = useCounter();\n' +
        '  return <button onClick={inc}>{count}</button>;\n' +
        '};\n',
      'src/hooks/useCounter.ts':
        "import { useState } from 'react';\n\n" +
        'export function useCounter() {\n' +
        '  const [count, setCount] = useState(0);\n' +
        '  const inc = () => setCount((c) => c + 1);\n' +
        '  return { count, inc };\n' +
        '}\n',
      'src/components/Button.tsx':
        'export const Button = (props: { label: string }) => {\n' +
        '  return <button>{props.label}</button>;\n' +
        '};\n',
      'src/utils/format.ts':
        "export function formatName(first: string, last: string): string {\n" +
        "  return `${first} ${last}`;\n" +
        '}\n',
    },
  },
  {
    name: 'react-full',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'react-full',
          version: '1.0.0',
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            'react-router-dom': '^6.22.0',
            zustand: '^4.5.0',
            axios: '^1.6.0',
          },
          devDependencies: { typescript: '^5.4.0', vitest: '^2.1.0' },
          scripts: {
            build: 'tsc',
            test: 'vitest run',
            'type-check': 'tsc --noEmit',
          },
        },
        null,
        2
      ),
      'tsconfig.json': JSON.stringify(
        { compilerOptions: { strict: true, jsx: 'react-jsx', target: 'ES2020' } },
        null,
        2
      ),
      'src/router.tsx':
        "import { createBrowserRouter } from 'react-router-dom';\n" +
        "import { Home } from './pages/Home';\n\n" +
        'export const router = createBrowserRouter([\n' +
        "  { path: '/', element: <Home /> },\n" +
        ']);\n',
      'src/pages/Home.tsx':
        "export const Home = () => {\n" +
        '  return <div>Home</div>;\n' +
        '};\n',
      'src/store/useUserStore.ts':
        "import { create } from 'zustand';\n\n" +
        'interface UserState {\n' +
        '  name: string;\n' +
        '  setName: (name: string) => void;\n' +
        '}\n\n' +
        'export const useUserStore = create<UserState>((set) => ({\n' +
        "  name: '',\n" +
        '  setName: (name) => set({ name }),\n' +
        '}));\n',
      'src/api/client.ts':
        "import axios from 'axios';\n\n" +
        "export const apiClient = axios.create({ baseURL: '/api' });\n",
      'src/utils/safeFetch.ts':
        "export async function safeFetch(url: string): Promise<unknown> {\n" +
        '  try {\n' +
        '    const res = await fetch(url);\n' +
        '    return await res.json();\n' +
        '  } catch (error) {\n' +
        "    console.error('fetch failed', error);\n" +
        '    throw error;\n' +
        '  }\n' +
        '}\n',
      'src/App.test.tsx':
        "import { describe, it, expect } from 'vitest';\n\n" +
        "describe('App', () => {\n" +
        "  it('works', () => {\n" +
        '    expect(1 + 1).toBe(2);\n' +
        '  });\n' +
        '});\n',
    },
  },
  {
    name: 'express-api',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'express-api',
          version: '1.0.0',
          dependencies: { express: '^4.19.0' },
          devDependencies: { typescript: '^5.4.0' },
          scripts: { build: 'tsc', start: 'node dist/index.js' },
        },
        null,
        2
      ),
      'tsconfig.json': JSON.stringify(
        { compilerOptions: { strict: true, target: 'ES2020', module: 'CommonJS' } },
        null,
        2
      ),
      'src/index.ts':
        "import express from 'express';\n" +
        "import { userRouter } from './routes/users';\n\n" +
        'const app = express();\n' +
        "app.use('/users', userRouter);\n" +
        'app.listen(3000);\n',
      'src/routes/users.ts':
        "import { Router } from 'express';\n" +
        "import { getUser } from '../controllers/userController';\n\n" +
        'export const userRouter = Router();\n' +
        "userRouter.get('/:id', getUser);\n",
      'src/controllers/userController.ts':
        "import type { Request, Response } from 'express';\n\n" +
        'export function getUser(req: Request, res: Response): void {\n' +
        '  res.json({ id: req.params.id });\n' +
        '}\n',
    },
  },
];

function writeFixture(root: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, 'utf-8');
  }
}

/** 去除产出中可能出现的临时绝对路径，确保快照稳定。 */
function normalizeContent(content: string, root: string): string {
  return content.split(root).join('<ROOT>');
}

describe('rules generation snapshots (refactor safety net)', () => {
  for (const fixture of fixtures) {
    it(
      `produces stable rules for ${fixture.name}`,
      async () => {
        const parent = mkdtempSync(join(tmpdir(), 'crg-snap-'));
        const root = join(parent, fixture.name);
        mkdirSync(root, { recursive: true });

        try {
          writeFixture(root, fixture.files);

          const pipeline = new AnalysisPipeline();
          const { context } = await pipeline.run(root, {
            includeBestPractices: false,
          });

          const rules = await new RulesGenerator().generate(context, {});

          const normalized = rules
            .slice()
            .sort((a, b) => a.fileName.localeCompare(b.fileName))
            .map((rule) => ({
              fileName: rule.fileName,
              content: normalizeContent(rule.content, root),
            }));

          expect(normalized).toMatchSnapshot();
        } finally {
          rmSync(parent, { recursive: true, force: true });
        }
      },
      20000
    );
  }
});
