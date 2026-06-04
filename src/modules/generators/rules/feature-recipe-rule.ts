/**
 * 端到端功能创建指南规则生成器
 *
 * 回答"新增一个完整功能需要创建哪些文件、遵循什么步骤"，
 * 按 types → API → store → component → route 顺序给出基于项目实际技术栈的模板。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import { detectMobXPattern } from "./state-management-rule.js";

/**
 * Feature Recipe — 端到端功能创建指南
 * 回答"我要新增一个完整功能需要创建哪些文件、遵循什么步骤"这个核心问题
 */
export async function generateFeatureRecipeRule(context: RuleGenerationContext): Promise<CursorRule> {
    const metadata = buildRuleMetadata(
      "端到端功能创建指南",
      "Step-by-step recipe for adding a complete feature: types → API → store → component → route",
      88,
      context.techStack.primary,
      ["feature", "workflow", "recipe"],
      "guideline",
      ["global-rules", "project-structure", "architecture"]
    );

    const isTS = context.techStack.languages.includes("TypeScript");
    const ext = isTS ? "ts" : "js";
    const extx = isTS ? "tsx" : "jsx";
    const org = context.fileOrganization;

    const stateLib = context.techStack.dependencies.find((d) =>
      ["redux", "mobx", "zustand", "pinia", "vuex"].some((lib) =>
        d.name.toLowerCase().includes(lib)
      )
    );
    const hasMobX = stateLib?.name?.toLowerCase().includes("mobx");
    const hasRedux = stateLib?.name?.toLowerCase().includes("redux");
    const hasZustand = stateLib?.name?.toLowerCase().includes("zustand");

    // 基于版本 + 实际代码检测 MobX 模式，与 state-management.mdc 保持一致
    const mobxPattern = hasMobX ? await detectMobXPattern(context) : 'makeAutoObservable';

    const apiClient = context.customPatterns?.apiClient;
    const apiClientName = apiClient?.name || "apiClient";
    const hasAxios = context.techStack.dependencies.some((d) => d.name === "axios");

    const typeDir = org?.typesLocation?.[0] || `src/types`;
    const apiDir = org?.apiLocation?.[0] || `src/api`;
    const storeDir = `src/store`;
    const compDir = org?.componentLocation?.[0] || `src/components`;
    // 路由注册的页面组件（步骤6被 router 挂载）应放在页面目录，而非可复用组件目录
    // 优先从 deepAnalysis 检测 views/pages/screens 目录（与 generateNewFileGuidelines 逻辑一致）
    const PAGE_DIR_KEYWORDS = new Set(['views', 'pages', 'screens']);
    const pageDir = (context.deepAnalysis ?? [])
      .filter(d => PAGE_DIR_KEYWORDS.has(d.path.split('/').pop()?.toLowerCase() ?? ''))
      .sort((a, b) => a.depth - b.depth)[0]?.path || compDir;
    const routeDir = (context.frontendRouter?.info?.location?.[0] || `src/routes`).replace(/\/$/, '');
    const hookDir = org?.hooksLocation?.[0] || `src/hooks`;

    // 将检测到的 typeDir 转为 import 别名（src/xxx → @/xxx）
    const typeAlias = typeDir.replace(/^src\//, '@/');
    const apiAlias = apiDir.replace(/^src\//, '@/');

    let storeStep = "";
    if (hasMobX) {
      // 根据检测到的实际 MobX 模式选择模板
      const mobxStoreBody = mobxPattern === 'makeAutoObservable'
        ? `import { makeAutoObservable } from "mobx";
import type { FeatureItem } from "${typeAlias}/feature";

class FeatureStore {
  items: FeatureItem[] = [];
  loading = false;
  error: string | null = null;

  constructor() { makeAutoObservable(this); }

  async fetchItems() {
    this.loading = true;
    try {
      this.items = await fetchFeatureList();
    } catch (err) {
      this.error = String(err);
    } finally {
      this.loading = false;
    }
  }
}`
        : `import { makeObservable, observable, action } from "mobx";
import type { FeatureItem } from "${typeAlias}/feature";

class FeatureStore {
  @observable items: FeatureItem[] = [];
  @observable loading = false;
  @observable error: string | null = null;

  constructor() { makeObservable(this); }

  @action
  async fetchItems() {
    this.loading = true;
    try {
      this.items = await fetchFeatureList();
    } catch (err) {
      this.error = String(err);
    } finally {
      this.loading = false;
    }
  }
}`;

      storeStep = `
### 3. Store（MobX）

\`\`\`${ext}
// ${storeDir}/featureStore.${ext}
${mobxStoreBody}
export const featureStore = new FeatureStore();
\`\`\`
`;
    } else if (hasRedux) {
      storeStep = `
### 3. Store（Redux Toolkit）

\`\`\`${ext}
// ${storeDir}/featureSlice.${ext}
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { FeatureItem } from "${typeAlias}/feature";

export const loadFeatures = createAsyncThunk("feature/load", fetchFeatureList);

const featureSlice = createSlice({
  name: "feature",
  initialState: { items: [] as FeatureItem[], loading: false, error: null as string | null },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(loadFeatures.pending, (s) => { s.loading = true; });
    b.addCase(loadFeatures.fulfilled, (s, a) => { s.loading = false; s.items = a.payload; });
    b.addCase(loadFeatures.rejected, (s, a) => { s.loading = false; s.error = a.error.message ?? null; });
  },
});
export default featureSlice.reducer;
\`\`\`
`;
    } else if (hasZustand) {
      storeStep = `
### 3. Store（Zustand）

\`\`\`${ext}
// ${storeDir}/featureStore.${ext}
import { create } from "zustand";
import type { FeatureItem } from "${typeAlias}/feature";

interface FeatureStore {
  items: FeatureItem[];
  loading: boolean;
  fetchItems: () => Promise<void>;
}

export const useFeatureStore = create<FeatureStore>((set) => ({
  items: [],
  loading: false,
  fetchItems: async () => {
    set({ loading: true });
    const items = await fetchFeatureList();
    set({ items, loading: false });
  },
}));
\`\`\`
`;
    }

    const content = metadata + `
# 端到端功能创建指南

> 新增一个完整功能时，按此顺序创建文件，避免缺漏。

## 标准步骤

### 1. 类型定义

\`\`\`${ext}
// ${typeDir}/feature.${ext}
export interface FeatureItem {
  id: string;
  name: string;
  // ...项目实际字段
}

export interface FeatureListParams {
  page: number;
  pageSize: number;
}
\`\`\`

### 2. API 函数

\`\`\`${ext}
// ${apiDir}/feature.${ext}
import type { FeatureItem, FeatureListParams } from "${typeAlias}/feature";
${hasAxios ? `import { ${apiClientName} } from "${apiAlias}";` : ""}

export async function fetchFeatureList(params: FeatureListParams): Promise<FeatureItem[]> {
  const { data } = await ${hasAxios ? apiClientName : "fetch"}${hasAxios ? `.get("/api/features", { params })` : '(`/api/features?page=${params.page}`)'};
  return data;
}

export async function fetchFeatureById(id: string): Promise<FeatureItem> {
  const { data } = await ${hasAxios ? `${apiClientName}.get(\`/api/features/\${id}\`)` : `fetch(\`/api/features/\${id}\`)`};
  return data;
}
\`\`\`
${storeStep}
### ${stateLib ? "4" : "3"}. 可复用 Hook（可选）

\`\`\`${ext}
// ${hookDir}/useFeature.${ext}
export function useFeature(id: string) {
  // 封装数据获取、loading 状态、错误处理
  // 组件直接调用，不重复写 fetch 逻辑
}
\`\`\`

### ${stateLib ? "5" : "4"}. 页面组件

\`\`\`${extx}
// ${pageDir}/FeatureList/FeatureList.${extx}
// 只负责渲染，业务逻辑在 Hook / Store 中
export function FeatureList() {
  // 1. 从 store/hook 获取数据
  // 2. 处理 loading / error 状态
  // 3. 渲染列表
}
\`\`\`

### ${stateLib ? "6" : "5"}. 路由注册

\`\`\`${extx}
// ${routeDir}/index.${extx} 或路由配置文件
{ path: "/features", element: <FeatureList /> }
{ path: "/features/:id", element: <FeatureDetail /> }
\`\`\`

## 文件检查清单

新建功能后确认以下文件已创建/更新：

- [ ] \`${typeDir}/feature.${ext}\` — 类型定义
- [ ] \`${apiDir}/feature.${ext}\` — API 函数
${stateLib ? `- [ ] \`${storeDir}/featureStore.${ext}\` — Store\n` : ""}- [ ] \`${hookDir}/useFeature.${ext}\` — 数据 Hook（可选）
- [ ] \`${pageDir}/FeatureList/\` — 页面组件
- [ ] 路由配置已更新

---

*遵循此模式保持项目一致性。参考 @project-structure.mdc 确认各类文件的实际目录位置。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "feature-recipe.mdc",
      priority: 88,
      type: "guideline",
      depends: ["global-rules", "project-structure", "architecture"],
    };
}
