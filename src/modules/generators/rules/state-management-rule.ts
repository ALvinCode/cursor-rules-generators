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
    const stateLib = context.techStack.dependencies.find((d) =>
      ["redux", "mobx", "zustand", "pinia", "vuex"].some((lib) =>
        d.name.toLowerCase().includes(lib)
      )
    );

    // MobX 时基于版本 + 实际代码检测使用模式
    const isMobX = stateLib?.name?.toLowerCase().includes('mobx') ?? false;
    const mobxPattern = isMobX ? await detectMobXPattern(context) : 'makeAutoObservable';
    const mobxAccess = isMobX ? await detectMobXAccessPattern(context) : undefined;

    const storeGlobs = getStoreGlobs(context);
    const metadata = buildRuleMetadata(
      "状态管理规范",
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
# 状态管理规范

参考: @global-rules.mdc

${generateStateManagementContent(context, stateLib?.name, mobxPattern, mobxAccess)}

---

*状态管理是项目的核心，遵循既定模式。*
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
    const stateLib = context.techStack.dependencies.find((d) =>
      ['redux', 'mobx', 'zustand', 'pinia', 'vuex'].some((lib) =>
        d.name.toLowerCase().includes(lib)
      )
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
): Promise<'makeAutoObservable' | 'decorator'> {
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

    // 实际代码中有 makeAutoObservable → 优先
    if (foundAutoObservable) return 'makeAutoObservable';
    // 实际代码中有 decorator 写法
    if (foundDecorator) return 'decorator';

    // --- 步骤 2：依据安装版本判断 ---
    const mobxDep = context.techStack.dependencies.find(
      (d) => d.name === 'mobx' || d.name === 'mobx-react' || d.name === 'mobx-react-lite'
    );
    if (mobxDep?.version) {
      // 去掉版本前缀符号（^, ~, >=）
      const rawVersion = mobxDep.version.replace(/^[\^~>=<]+/, '');
      const majorVersion = parseInt(rawVersion.split('.')[0] ?? '0', 10);
      // MobX 4/5 只有 decorator 写法；MobX 6+ 默认推荐 makeAutoObservable
      if (majorVersion < 6) return 'decorator';
      if (majorVersion >= 6) return 'makeAutoObservable';
    }

    // --- 步骤 3：fallback ---
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
  mobxPattern: 'makeAutoObservable' | 'decorator' = 'makeAutoObservable',
  mobxAccess?: MobXAccessInfo
): string {
    if (!libName) {
      return "项目使用状态管理，请遵循一致的状态更新模式。";
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
          ? `import { makeObservable, observable, action } from 'mobx'

class UserStore {
  @observable user: User | null = null

  constructor() {
    makeObservable(this)
  }

  @action
  setUser(user: User): void {
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
}`;

      const bestPractices = mobxPattern === 'makeAutoObservable'
        ? `- 使用 makeAutoObservable 自动推断所有属性为 observable、action
- 不需要手动声明 @observable/@action（减少样板代码）
- 组件用 observer() 包装
- 避免直接修改 observable（应在 action 中修改）`
        : `- 使用 @observable 定义响应式状态
- 使用 @action 定义状态修改方法
- 组件用 observer() 包装
- 避免直接修改 observable`;

      return `## MobX 状态管理

### 项目当前使用
- 状态管理库: MobX
- Store 位置: \`${storeDir}/\`
- 使用模式: ${mobxPattern === 'makeAutoObservable' ? 'makeAutoObservable（自动推断）' : 'makeObservable + Decorators（显式声明）'}

### 使用规范

**定义 Store**:
\`\`\`typescript
${storeExample}
\`\`\`

**在组件中使用**:
\`\`\`typescript
import { observer } from '${mobxAccess?.observerPackage || "mobx-react-lite"}'
${mobxAccess?.accessPattern === "direct-import" && mobxAccess.importExample ? mobxAccess.importExample : `import { SomeStore } from '@/${storeDir}'`}

export const UserProfile = observer(() => {
  ${mobxAccess?.accessPattern === "direct-import" ? "// 直接导入 Store 实例使用" : mobxAccess?.accessPattern === "useStores" ? "const { someStore } = useStores()" : "// 按项目约定获取 Store"}
  return <div>{/* ... */}</div>
})
\`\`\`

### 最佳实践

${bestPractices}

参考: 查找项目中的 Store 文件作为示例`;
    }

    if (lowerLib.includes("redux")) {
      return `## Redux 状态管理

### 使用规范

- 使用 Redux Toolkit
- Slice 按功能模块组织
- 使用 createSlice 定义 reducer
- 异步逻辑使用 createAsyncThunk

参考项目中现有的 slice 文件`;
    }

    if (lowerLib.includes("zustand")) {
      return `## Zustand 状态管理

### 使用规范

- 使用 create 创建 store
- 保持 store 扁平化
- 使用 immer 中间件处理复杂状态`;
    }

    return `## ${libName} 状态管理\n\n请遵循 ${libName} 的官方最佳实践。`;
}
