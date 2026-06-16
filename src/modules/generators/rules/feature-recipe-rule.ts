/**
 * 端到端功能创建指南规则生成器
 *
 * 回答"新增一个完整功能需要创建哪些文件、遵循什么步骤"，
 * 按 types → API → store → component → route 顺序给出基于项目实际技术栈的模板。
 */

import * as path from "path";
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

    const mobxPattern = hasMobX ? await detectMobXPattern(context) : 'makeAutoObservable';
    const isDecoratorLegacy = mobxPattern === 'decorator-legacy';

    // Sample a real business name from pages/views for example naming
    const PAGE_DIR_KW = new Set(['views', 'pages', 'screens']);
    const pageDirs = (context.deepAnalysis ?? []).filter((d) => {
      if (d.depth < 2) return false;
      const parentName = d.path.split('/').slice(-2, -1)[0]?.toLowerCase() ?? '';
      if (!PAGE_DIR_KW.has(parentName)) return false;
      const dirName = d.path.split('/').pop() ?? '';
      return /^[a-zA-Z]/.test(dirName);
    });
    let sampleBizName = 'Feature';
    if (pageDirs.length > 0) {
      sampleBizName = pageDirs[0].path.split('/').pop()!.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s/g, '');
    } else {
      const sampleDirs = [...(org?.apiLocation ?? []), ...(org?.typesLocation ?? [])];
      const sampleFile = (context.files ?? []).find((f) => {
        const rel = path.relative(context.projectPath, f);
        return sampleDirs.some((d) => rel.startsWith(d)) && /^[a-zA-Z]/.test(path.basename(f)) && !path.basename(f).startsWith('index') && !path.basename(f).startsWith('base');
      });
      if (sampleFile) {
        sampleBizName = path.basename(sampleFile, path.extname(sampleFile)).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s/g, '');
      }
    }
    const sampleBizLower = sampleBizName.charAt(0).toLowerCase() + sampleBizName.slice(1);

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
import type { ${sampleBizName}Item } from "${typeAlias}/${sampleBizLower}";

class ${sampleBizName}Store {
  items: ${sampleBizName}Item[] = [];
  loading = false;
  error: string | null = null;

  constructor() { makeAutoObservable(this); }

  async fetchItems() {
    this.loading = true;
    try {
      this.items = await fetch${sampleBizName}List();
    } catch (err) {
      this.error = String(err);
    } finally {
      this.loading = false;
    }
  }
}`
        : isDecoratorLegacy
          ? `import { observable, action } from "mobx";
import type { ${sampleBizName}Item } from "${typeAlias}/${sampleBizLower}";

class ${sampleBizName}Store {
  @observable items: ${sampleBizName}Item[] = [];
  @observable loading = false;
  @observable error: string | null = null;

  @action
  async fetchItems() {
    this.loading = true;
    try {
      this.items = await fetch${sampleBizName}List();
    } catch (err) {
      this.error = String(err);
    } finally {
      this.loading = false;
    }
  }
}`
          : `import { makeObservable, observable, action } from "mobx";
import type { ${sampleBizName}Item } from "${typeAlias}/${sampleBizLower}";

class ${sampleBizName}Store {
  @observable items: ${sampleBizName}Item[] = [];
  @observable loading = false;
  @observable error: string | null = null;

  constructor() { makeObservable(this); }

  @action
  async fetchItems() {
    this.loading = true;
    try {
      this.items = await fetch${sampleBizName}List();
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
// ${storeDir}/${sampleBizLower}Store.${ext}
${mobxStoreBody}
export const ${sampleBizLower}Store = new ${sampleBizName}Store();
\`\`\`
`;
    } else if (hasRedux) {
      storeStep = `
### 3. Store（Redux Toolkit）

\`\`\`${ext}
// ${storeDir}/featureSlice.${ext}
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { ${sampleBizName}Item } from "${typeAlias}/${sampleBizLower}";

export const load${sampleBizName}s = createAsyncThunk("${sampleBizLower}/load", fetch${sampleBizName}List);

const ${sampleBizLower}Slice = createSlice({
  name: "${sampleBizLower}",
  initialState: { items: [] as ${sampleBizName}Item[], loading: false, error: null as string | null },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(load${sampleBizName}s.pending, (s) => { s.loading = true; });
    b.addCase(load${sampleBizName}s.fulfilled, (s, a) => { s.loading = false; s.items = a.payload; });
    b.addCase(load${sampleBizName}s.rejected, (s, a) => { s.loading = false; s.error = a.error.message ?? null; });
  },
});
export default ${sampleBizLower}Slice.reducer;
\`\`\`
`;
    } else if (hasZustand) {
      storeStep = `
### 3. Store（Zustand）

\`\`\`${ext}
// ${storeDir}/${sampleBizLower}Store.${ext}
import { create } from "zustand";
import type { ${sampleBizName}Item } from "${typeAlias}/${sampleBizLower}";

interface ${sampleBizName}Store {
  items: ${sampleBizName}Item[];
  loading: boolean;
  fetchItems: () => Promise<void>;
}

export const use${sampleBizName}Store = create<${sampleBizName}Store>((set) => ({
  items: [],
  loading: false,
  fetchItems: async () => {
    set({ loading: true });
    const items = await fetch${sampleBizName}List();
    set({ items, loading: false });
  },
}));
\`\`\`
`;
    }

    const content = metadata + `
# End-to-End Feature Creation Guide

> When adding a complete feature, create files in this order to avoid gaps.
> Examples below use **${sampleBizName}** as a representative module — adapt names to your actual feature.

## Standard Steps

### 1. Type Definitions

\`\`\`${ext}
// ${typeDir}/${sampleBizLower}.${ext}
export interface ${sampleBizName}Item {
  id: string;
  name: string;
  // ...actual project fields
}

export interface ${sampleBizName}ListParams {
  page: number;
  pageSize: number;
}
\`\`\`

### 2. API Functions

\`\`\`${ext}
// ${apiDir}/${sampleBizLower}.${ext}
import type { ${sampleBizName}Item, ${sampleBizName}ListParams } from "${typeAlias}/${sampleBizLower}";
${clientImportStmt}

export ${isTS ? "const" : "async function"} fetch${sampleBizName}List${isTS ? " = " : ""}(params${isTS ? `: ${sampleBizName}ListParams` : ""})${isTS ? " =>" : ""} {
  return ${hasHttpClient ? `${apiClientName}.get${isTS ? `<${sampleBizName}Item[]>` : ""}("/${sampleBizLower}s", { params })` : `fetch(\`/api/${sampleBizLower}s?page=\${params.page}\`)`};
}${isTS ? ";" : ""}
\`\`\`
${storeStep}
### ${stateLib ? "4" : "3"}. Reusable Hook (Optional)

\`\`\`${ext}
// ${hookDir}/use${sampleBizName}.${ext}
export function use${sampleBizName}(id: string) {
  // Encapsulate data fetching, loading state, and error handling
  // Components call this directly; don't duplicate fetch logic
}
\`\`\`

### ${stateLib ? "5" : "4"}. Page Component

\`\`\`${extx}
// ${pageDir}/${sampleBizName}List/${sampleBizName}List.${extx}
// Rendering only; business logic lives in Hook / Store
export function ${sampleBizName}List() {
  // 1. Get data from store/hook
  // 2. Handle loading / error states
  // 3. Render the list
}
\`\`\`

### ${stateLib ? "6" : "5"}. Route Registration

${(() => {
  const rrDep = context.techStack.dependencies.find((d) => d.name === 'react-router-dom' || d.name === 'react-router');
  const rrMajor = rrDep?.version ? parseInt(rrDep.version.replace(/^[\^~>=<]+/, ''), 10) : 6;
  if (rrMajor < 6) {
    return `\`\`\`${extx}
// ${routeDir}/index.${extx} or route config file
<Switch>
  <Route path="/${sampleBizLower}s" component={${sampleBizName}List} />
  <Route path="/${sampleBizLower}s/:id" component={${sampleBizName}Detail} />
</Switch>
\`\`\``;
  }
  return `\`\`\`${extx}
// ${routeDir}/index.${extx} or route config file
{ path: "/${sampleBizLower}s", element: <${sampleBizName}List /> }
{ path: "/${sampleBizLower}s/:id", element: <${sampleBizName}Detail /> }
\`\`\``;
})()}

## File Checklist

After adding a feature, confirm the following files were created/updated:

- [ ] \`${typeDir}/${sampleBizLower}.${ext}\` — Type definitions
- [ ] \`${apiDir}/${sampleBizLower}.${ext}\` — API functions
${stateLib ? `- [ ] \`${storeDir}/${sampleBizLower}Store.${ext}\` — Store\n` : ""}- [ ] \`${hookDir}/use${sampleBizName}.${ext}\` — Data hook (optional)
- [ ] \`${pageDir}/${sampleBizName}List/\` — Page component
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
