/**
 * 状态管理规则生成器
 *
 * 基于检测到的状态库（MobX/Redux/Zustand 等）生成使用规范。
 * MobX 使用模式（makeAutoObservable vs decorator）通过扫描实际代码 + 版本判定。
 * 自包含：通过动态 import 读取 store 文件，不依赖生成器实例状态。
 */

import * as path from "path";

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { FileUtils } from "../../../utils/file-utils.js";
import { buildRuleMetadata } from "./rule-metadata.js";

/**
 * v1.3: 生成状态管理规则（约 200 行）
 */
export async function generateStateManagementRule(
  context: RuleGenerationContext
): Promise<CursorRule> {
    const STATE_LIBS = [
      "redux", "@reduxjs/toolkit", "mobx", "zustand", "pinia", "vuex",
      "nanostores", "recoil", "jotai", "valtio", "xstate",
      "riverpod", "bloc", "provider", "getx",
    ];
    const stateLib = context.techStack.dependencies.find((d) =>
      STATE_LIBS.some((lib) => d.name.toLowerCase().includes(lib))
    );

    // MobX 时基于版本 + 实际代码检测使用模式
    const isMobX = stateLib?.name?.toLowerCase().includes('mobx') ?? false;
    const mobxPattern = isMobX ? await detectMobXPattern(context) : 'makeAutoObservable';
    const mobxAccess = isMobX ? await detectMobXAccessPattern(context) : undefined;

    const storeGlobs = getStoreGlobs(context);
    const metadata = buildRuleMetadata(
      "State Management Guidelines",
      `Consult when implementing state management, data flow, or ${stateLib?.name || "store"}-related code`,
      85,
      context.techStack.primary,
      ["state-management", "practice"],
      "practice",
      ["global-rules"],
      storeGlobs ? { globs: storeGlobs } : undefined
    );

    const content =
      metadata +
      `
# State Management Guidelines

See also: @global-rules.mdc

${generateStateManagementContent(context, stateLib?.name, mobxPattern, mobxAccess)}

---

*State management is core to the project — follow established patterns.*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "state-management.mdc",
      priority: 85,
      type: "practice",
      depends: ["global-rules"],
    };
}

function getStoreGlobs(context: RuleGenerationContext): string | null {
    const STATE_LIBS_GLOB = [
      "redux", "@reduxjs/toolkit", "mobx", "zustand", "pinia", "vuex",
      "nanostores", "recoil", "jotai", "valtio", "xstate",
      "riverpod", "bloc", "provider", "getx",
    ];
    const stateLib = context.techStack.dependencies.find((d) =>
      STATE_LIBS_GLOB.some((lib) => d.name.toLowerCase().includes(lib))
    );
    if (!stateLib) return null;

    // 收集所有作用域层级的 store 目录：
    //   - 全局层（src/store/, src/stores/）
    //   - 业务层（src/views/X/store/, src/features/X/state/, etc.）
    // 来源 1：fileOrganization.structure（已识别的文件组织信息）
    const structureDirs = (context.fileOrganization?.structure ?? [])
      .filter((d) => /\b(store|stores|slice|state|reducer)\b/i.test(d.path.split('/').pop() ?? ''))
      .map((d) => d.path.replace(/^\//, ''));

    // 来源 2：deepAnalysis（覆盖所有深度，含业务模块内的局部 store 目录）
    const deepDirs = (context.deepAnalysis ?? [])
      .filter((d) => /\b(store|stores|slice|state|reducer)\b/i.test(d.path.split('/').pop() ?? ''))
      .map((d) => d.path.replace(/^\//, ''));

    const allDirs = [...new Set([...structureDirs, ...deepDirs])]
      .filter((p) => p.length > 0 && !path.isAbsolute(p))
      .sort((a, b) => a.split('/').length - b.split('/').length); // 浅路径优先排列

    if (allDirs.length > 0) {
      return allDirs.map((d) => `${d.replace(/\/$/, '')}/**`).join(', ');
    }
    return '**/store/**, **/stores/**, **/slice/**';
}

/**
 * 检测 MobX 使用模式（makeAutoObservable vs decorator）。
 * 扫描实际 store 代码 + 版本判定。同时供 feature-recipe 复用。
 */
export async function detectMobXPattern(
  context: RuleGenerationContext
): Promise<'makeAutoObservable' | 'decorator' | 'decorator-legacy'> {
    // --- 步骤 1：扫描实际 store 文件内容 ---
    const deep = context.deepAnalysis || [];
    const storeDirs = deep
      .filter((d) => /\bstore[s]?\b/i.test(d.path.split('/').pop() ?? ''))
      .sort((a, b) => a.depth - b.depth)
      .slice(0, 3); // 只扫描最浅的 3 个 store 目录

    let foundAutoObservable = false;
    let foundDecorator = false;

    for (const dir of storeDirs) {
      try {
        const dirPath = path.join(context.projectPath, dir.path);
        const { readdir } = await import('fs/promises');
        const entries = await readdir(dirPath, { withFileTypes: true });
        const storeFiles = entries
          .filter((e) => e.isFile() && /\.(ts|tsx|js|jsx)$/.test(e.name))
          .slice(0, 5); // 每个目录最多抽查 5 个文件

        for (const file of storeFiles) {
          const filePath = path.join(dirPath, file.name);
          const content = await FileUtils.readFile(filePath);
          if (content.includes('makeAutoObservable')) foundAutoObservable = true;
          if (content.includes('@observable') || content.includes('makeObservable(this)')) {
            foundDecorator = true;
          }
          if (foundAutoObservable || foundDecorator) break;
        }
        if (foundAutoObservable || foundDecorator) break;
      } catch {
        // 目录读取失败时静默跳过
      }
    }

    // --- 步骤 2：获取 MobX 主版本号 ---
    const mobxDep = context.techStack.dependencies.find(
      (d) => d.name === 'mobx' || d.name === 'mobx-react' || d.name === 'mobx-react-lite'
    );
    const mobxMajor = mobxDep?.version
      ? parseInt(mobxDep.version.replace(/^[\^~>=<]+/, '').split('.')[0] ?? '0', 10)
      : 0;

    // 实际代码中有 makeAutoObservable → 优先
    if (foundAutoObservable) return 'makeAutoObservable';
    // 实际代码中有 decorator 写法 → 区分 MobX 5（纯装饰器）和 MobX 6+（需要 makeObservable）
    if (foundDecorator) return mobxMajor > 0 && mobxMajor < 6 ? 'decorator-legacy' : 'decorator';

    // --- 步骤 3：依据安装版本判断 ---
    if (mobxMajor > 0) {
      if (mobxMajor < 6) return 'decorator-legacy';
      return 'makeAutoObservable';
    }

    // --- 步骤 4：fallback ---
    return 'makeAutoObservable';
}

export interface MobXAccessInfo {
  /** mobx-react | mobx-react-lite */
  observerPackage: string;
  /** direct-import | useStores | context | inject */
  accessPattern: "direct-import" | "useStores" | "context" | "inject";
  /** 实际 import 示例（如 "import { GlobalStore } from '@/store'"） */
  importExample?: string;
}

/**
 * 检测组件中如何访问 MobX store（直接 import vs useStores vs inject 等）。
 * 同时检测使用的是 mobx-react 还是 mobx-react-lite。
 */
export async function detectMobXAccessPattern(
  context: RuleGenerationContext
): Promise<MobXAccessInfo> {
  const deps = context.techStack.dependencies.map((d) => d.name);
  const hasMobxReact = deps.includes("mobx-react");
  const hasMobxReactLite = deps.includes("mobx-react-lite");
  const observerPackage = hasMobxReactLite && !hasMobxReact
    ? "mobx-react-lite"
    : hasMobxReact ? "mobx-react" : "mobx-react-lite";

  const srcFiles = (context.files ?? [])
    .filter((f) => /\.(tsx|jsx)$/.test(f) && !f.includes(".test.") && !f.includes("node_modules"))
    .slice(0, 50);

  let directImportCount = 0;
  let useStoresCount = 0;
  let injectCount = 0;
  let importExample = "";

  for (const file of srcFiles) {
    const content = await FileUtils.readFile(file);
    if (!content.includes("observer") && !content.includes("store")) continue;

    if (/import\s+.*(?:Store|store).*from\s+['"]@?\/?(?:src\/)?store/i.test(content)) {
      directImportCount++;
      if (!importExample) {
        const match = content.match(/import\s+\{?\s*\w+Store\s*\}?\s*from\s+['"][^'"]+['"]/);
        if (match) importExample = match[0];
      }
    }
    if (content.includes("useStores") || content.includes("useStore(")) {
      useStoresCount++;
    }
    if (content.includes("@inject") || content.includes("inject(")) {
      injectCount++;
    }
  }

  let accessPattern: MobXAccessInfo["accessPattern"] = "direct-import";
  if (useStoresCount > directImportCount && useStoresCount > injectCount) {
    accessPattern = "useStores";
  } else if (injectCount > directImportCount && injectCount > useStoresCount) {
    accessPattern = "inject";
  }

  return { observerPackage, accessPattern, importExample };
}

/**
 * 生成状态管理内容
 */
function generateStateManagementContent(
  context: RuleGenerationContext,
  libName?: string,
  mobxPattern: 'makeAutoObservable' | 'decorator' | 'decorator-legacy' = 'makeAutoObservable',
  mobxAccess?: MobXAccessInfo
): string {
    if (!libName) {
      return "The project uses state management — follow consistent state update patterns.";
    }

    const lowerLib = libName.toLowerCase();

    if (lowerLib.includes("mobx")) {
      const isTS = context.techStack.languages.includes("TypeScript");

      // 动态推断 store 目录：从 deepAnalysis 中找 basename 含 store/stores 的最浅目录
      const storeDir = (() => {
        const deep = context.deepAnalysis || [];
        const storeEntries = deep.filter((d) =>
          /^store[s]?$/i.test(d.path.split('/').pop() || '')
        );
        if (storeEntries.length > 0) {
          storeEntries.sort((a, b) => a.depth - b.depth);
          return storeEntries[0].path;
        }
        return 'src/store';
      })();

      // 根据检测到的实际模式 + 是否 TypeScript 输出对应模板
      const storeExample = mobxPattern === 'makeAutoObservable'
        ? isTS
          ? `import { makeAutoObservable } from 'mobx'

interface User {
  id: string
  name: string
}

class UserStore {
  user: User | null = null
  loading: boolean = false
  error: string | null = null

  constructor() {
    makeAutoObservable(this)
  }

  setUser(user: User): void {
    this.user = user
  }

  async fetchUser(id: string): Promise<void> {
    this.loading = true
    try {
      this.user = await api.getUser(id)
    } catch (err) {
      this.error = String(err)
    } finally {
      this.loading = false
    }
  }
}`
          : `import { makeAutoObservable } from 'mobx'

class UserStore {
  user = null
  loading = false

  constructor() {
    makeAutoObservable(this)
  }

  setUser(user) {
    this.user = user
  }
}`
        : isTS
          ? (mobxPattern === 'decorator-legacy'
            ? `import { observable, action } from 'mobx'

class UserStore {
  @observable user: User | null = null

  @action
  setUser(user: User): void {
    this.user = user
  }
}`
            : `import { makeObservable, observable, action } from 'mobx'

class UserStore {
  @observable user: User | null = null

  constructor() {
    makeObservable(this)
  }

  @action
  setUser(user: User): void {
    this.user = user
  }
}`)
          : (mobxPattern === 'decorator-legacy'
            ? `import { observable, action } from 'mobx'

class UserStore {
  @observable user = null

  @action
  setUser(user) {
    this.user = user
  }
}`
            : `import { makeObservable, observable, action } from 'mobx'

class UserStore {
  @observable user = null

  constructor() {
    makeObservable(this)
  }

  @action
  setUser(user) {
    this.user = user
  }
}`);

      const bestPractices = mobxPattern === 'makeAutoObservable'
        ? `- Use makeAutoObservable to automatically infer all properties as observable/action
- No need to manually declare @observable/@action (reduces boilerplate)
- Wrap components with observer()
- Avoid mutating observables directly (mutate inside actions)`
        : mobxPattern === 'decorator-legacy'
        ? `- Use @observable for reactive state
- Use @action for state mutation methods
- Wrap components with observer()
- Avoid mutating observables directly
- No makeObservable() call needed (MobX 5 decorator mode)`
        : `- Use @observable for reactive state
- Use @action for state mutation methods
- Call makeObservable(this) in constructor (required for MobX 6+ decorators)
- Wrap components with observer()
- Avoid mutating observables directly`;

      return `## MobX State Management

### Current Project Usage
- State management library: MobX
- Store location: \`${storeDir}/\`
- Usage pattern: ${mobxPattern === 'makeAutoObservable' ? 'makeAutoObservable (auto-inferred)' : mobxPattern === 'decorator-legacy' ? 'Decorators (MobX 5 — no makeObservable needed)' : 'makeObservable + Decorators (explicit declarations)'}

### Usage Guidelines

**Define Store**:
\`\`\`typescript
${storeExample}
\`\`\`

**Use in Components**:
\`\`\`typescript
import { observer } from '${mobxAccess?.observerPackage || "mobx-react-lite"}'
${mobxAccess?.accessPattern === "direct-import" && mobxAccess.importExample ? mobxAccess.importExample : `import { SomeStore } from '@/${storeDir}'`}

export const UserProfile = observer(() => {
  ${mobxAccess?.accessPattern === "direct-import" ? "// Import store instance directly" : mobxAccess?.accessPattern === "useStores" ? "const { someStore } = useStores()" : "// Obtain store per project conventions"}
  return <div>{/* ... */}</div>
})
\`\`\`

### Best Practices

${bestPractices}

See also: Look for Store files in the project as examples`;
    }

    if (lowerLib.includes("redux")) {
      return `## Redux State Management

### Usage Guidelines

- Use Redux Toolkit
- Organize slices by feature module
- Use createSlice to define reducers
- Use createAsyncThunk for async logic

See existing slice files in the project for examples`;
    }

    if (lowerLib.includes("zustand")) {
      return `## Zustand State Management

### Usage Guidelines

- Use create to create stores
- Keep stores flat
- Use immer middleware for complex state`;
    }

    return `## ${libName} State Management\n\nFollow ${libName}'s official best practices.`;
}
