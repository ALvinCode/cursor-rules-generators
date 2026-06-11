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
    const isTS = context.techStack.languages.includes("TypeScript");
    const ext = isTS ? "ts" : "js";
    const extx = isTS ? "tsx" : "jsx";
    const org = context.fileOrganization;

    const stateLib = context.techStack.dependencies.find((d) =>
      ["redux", "mobx", "zustand", "pinia", "vuex"].some((lib) =>
        d.name.toLowerCase().includes(lib)
      )
    );

    const descSteps = stateLib
      ? "types → API → store → component → route"
      : "types → API → component → route";
    const metadata = buildRuleMetadata(
      "End-to-End Feature Creation Guide",
      `Step-by-step recipe for adding a complete feature: ${descSteps}`,
      88,
      context.techStack.primary,
      ["feature", "workflow", "recipe"],
      "guideline",
      ["global-rules", "project-structure", "architecture"]
    );
    const hasMobX = stateLib?.name?.toLowerCase().includes("mobx");
    const hasRedux = stateLib?.name?.toLowerCase().includes("redux");
    const hasZustand = stateLib?.name?.toLowerCase().includes("zustand");

    // 基于版本 + 实际代码检测 MobX 模式，与 state-management.mdc 保持一致
    const mobxPattern = hasMobX ? await detectMobXPattern(context) : 'makeAutoObservable';

    const typeDir = org?.typesLocation?.[0] || `src/types`;
    const apiDir = org?.apiLocation?.[0] || `src/api`;
    const storeDir = `src/store`;
    const compDir = org?.componentLocation?.[0] || `src/components`;
    const PAGE_DIR_KEYWORDS = new Set(['views', 'pages', 'screens']);
    const pageDir = (context.deepAnalysis ?? [])
      .filter(d => PAGE_DIR_KEYWORDS.has(d.path.split('/').pop()?.toLowerCase() ?? ''))
      .sort((a, b) => a.depth - b.depth)[0]?.path || compDir;
    const routeDir = (context.frontendRouter?.info?.location?.[0] || `src/routes`).replace(/\/$/, '');
    const hookDir = org?.hooksLocation?.[0] || `src/hooks`;

    const typeAlias = typeDir.replace(/^src\//, '@/');
    const apiAlias = apiDir.replace(/^src\//, '@/');

    const apiClient = context.customPatterns?.apiClient;
    const clientDetected = apiClient?.exists === true;
    const apiClientName = apiClient?.exportName || apiClient?.name || "apiClient";
    const clientPath = apiClient?.filePath
      ? apiClient.filePath.replace(/^src\//, '@/').replace(/\.(ts|js)$/, '')
      : apiAlias;
    const clientImportStmt = clientDetected
      ? (apiClient?.importStyle === "default"
        ? `import ${apiClientName} from "${clientPath}";`
        : `import { ${apiClientName} } from "${clientPath}";`)
      : "";
    const hasHttpClient = clientDetected || context.techStack.dependencies.some((d) => d.name === "axios");

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
# End-to-End Feature Creation Guide

> When adding a complete feature, create files in this order to avoid gaps.

## Standard Steps

### 1. Type Definitions

\`\`\`${ext}
// ${typeDir}/feature.${ext}
export interface FeatureItem {
  id: string;
  name: string;
  // ...actual project fields
}

export interface FeatureListParams {
  page: number;
  pageSize: number;
}
\`\`\`

### 2. API Functions

\`\`\`${ext}
// ${apiDir}/feature.${ext}
import type { FeatureItem, FeatureListParams } from "${typeAlias}/feature";
${clientImportStmt}

export ${isTS ? "const" : "async function"} fetchFeatureList${isTS ? " = " : ""}(params${isTS ? ": FeatureListParams" : ""})${isTS ? " =>" : ""} {
  return ${hasHttpClient ? `${apiClientName}.get${isTS ? "<FeatureItem[]>" : ""}("/features", { params })` : 'fetch(`/api/features?page=${params.page}`)'};
}${isTS ? ";" : ""}
\`\`\`
${storeStep}
### ${stateLib ? "4" : "3"}. Reusable Hook (Optional)

\`\`\`${ext}
// ${hookDir}/useFeature.${ext}
export function useFeature(id: string) {
  // Encapsulate data fetching, loading state, and error handling
  // Components call this directly; don't duplicate fetch logic
}
\`\`\`

### ${stateLib ? "5" : "4"}. Page Component

\`\`\`${extx}
// ${pageDir}/FeatureList/FeatureList.${extx}
// Rendering only; business logic lives in Hook / Store
export function FeatureList() {
  // 1. Get data from store/hook
  // 2. Handle loading / error states
  // 3. Render the list
}
\`\`\`

### ${stateLib ? "6" : "5"}. Route Registration

\`\`\`${extx}
// ${routeDir}/index.${extx} or route config file
{ path: "/features", element: <FeatureList /> }
{ path: "/features/:id", element: <FeatureDetail /> }
\`\`\`

## File Checklist

After adding a feature, confirm the following files were created/updated:

- [ ] \`${typeDir}/feature.${ext}\` — Type definitions
- [ ] \`${apiDir}/feature.${ext}\` — API functions
${stateLib ? `- [ ] \`${storeDir}/featureStore.${ext}\` — Store\n` : ""}- [ ] \`${hookDir}/useFeature.${ext}\` — Data hook (optional)
- [ ] \`${pageDir}/FeatureList/\` — Page component
- [ ] Route config updated

---

*Follow this pattern for project consistency. See @project-structure.mdc for actual directory locations.*
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
