/**
 * API 调用规范规则生成器
 *
 * 基于项目实际的 API 客户端封装（位置、鉴权、错误处理）生成调用约定，
 * 指导 AI 通过封装函数而非裸 fetch/axios 调用后端。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";

export function generateApiPatternsRule(
  context: RuleGenerationContext
): CursorRule {
  const org = context.fileOrganization;
  const apiClient = context.customPatterns?.apiClient;
  const apiDir = org?.apiLocation?.[0] || 'src/api';
  const apiAlias = apiDir.replace(/^src\//, '@/');
  const isTS = context.techStack.languages.includes("TypeScript");
  const ext = isTS ? "ts" : "js";
  const clientName = apiClient?.name || "apiClient";
  const clientPath = apiClient?.filePath
    ? apiClient.filePath.replace(/^.*?src\//, 'src/')
    : `${apiDir}/index.${ext}`;
  const clientImportAlias = clientPath.replace(/^src\//, '@/').replace(/\.(ts|js)$/, '');
  const hasAuth = apiClient?.hasAuth ?? false;
  const hasErrorHandling = apiClient?.hasErrorHandling ?? false;

  const globs = `${apiDir}/**`;
  const metadata = buildRuleMetadata(
    "API 调用规范",
    "How to call backend APIs: file location, client usage, error handling",
    80,
    context.techStack.primary,
    ["api", "http"],
    "practice",
    ["global-rules"],
    { globs }
  );

  const content = metadata + `
# API 调用规范

## 核心约定

- 所有 API 函数集中放在 \`${apiDir}/\` 目录下，按业务模块分文件
- **禁止**在组件/Store 中直接 \`fetch\`/\`axios.get\`，必须通过封装函数
- 每个函数只做一件事：请求 + 返回数据（副作用在调用方处理）

## HTTP 客户端

项目已封装 \`${clientName}\`，位于 \`${clientPath}\`：

\`\`\`${ext}
import { ${clientName} } from "${clientImportAlias}";
\`\`\`

${hasAuth ? `> ✅ 已内置鉴权逻辑（Token 自动注入），调用方无需手动设置 Authorization header。\n` : ""}
${hasErrorHandling ? `> ✅ 已内置统一错误处理（非 2xx 响应会统一弹出提示或跳转登录）。\n` : ""}

## 标准函数结构

\`\`\`${ext}
// ${apiDir}/feature.${ext}
import { ${clientName} } from "${clientImportAlias}";
${isTS ? `import type { FeatureItem, FeatureListParams } from "@/interface/feature";\n` : ""}
export async function fetchFeatureList(${isTS ? "params: FeatureListParams" : "params"}): Promise<${isTS ? "FeatureItem[]" : "any"}> {
  const { data } = await ${clientName}.get("/api/features", { params });
  return data;
}

export async function createFeature(${isTS ? "payload: Partial<FeatureItem>" : "payload"}): Promise<${isTS ? "FeatureItem" : "any"}> {
  const { data } = await ${clientName}.post("/api/features", payload);
  return data;
}
\`\`\`

## Do / Don't

\`\`\`${ext}
// ❌ 组件内直接 fetch
useEffect(() => {
  axios.get("/api/features").then(setList);
}, []);

// ✅ 调用封装函数
useEffect(() => {
  fetchFeatureList({ page: 1, pageSize: 20 }).then(setList);
}, []);
\`\`\`

${!hasErrorHandling ? `## 错误处理

每个 API 函数必须处理异常，或在调用方 try-catch：

\`\`\`${ext}
try {
  const list = await fetchFeatureList(params);
  setList(list);
} catch (error) {
  message.error("加载失败");
}
\`\`\`

参考: @error-handling.mdc` : ""}
`;

  return {
    scope: "specialized",
    modulePath: context.projectPath,
    content,
    fileName: "api-patterns.mdc",
    priority: 80,
    type: "practice",
    depends: ["global-rules"],
  };
}
