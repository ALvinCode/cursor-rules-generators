/**
 * API 调用规范规则生成器
 *
 * 基于项目实际的 API 客户端封装（位置、鉴权、错误处理）生成调用约定，
 * 指导 AI 通过封装函数而非裸 fetch/axios 调用后端。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import { FileUtils } from "../../../utils/file-utils.js";
import * as path from "path";

export async function generateApiPatternsRule(
  context: RuleGenerationContext
): Promise<CursorRule> {
  const org = context.fileOrganization;
  const apiClient = context.customPatterns?.apiClient;
  const apiDir = org?.apiLocation?.[0] || 'src/api';
  const isTS = context.techStack.languages.includes("TypeScript");
  const ext = isTS ? "ts" : "js";
  const clientDetected = apiClient?.exists === true;
  const clientName = apiClient?.exportName || apiClient?.name || "apiClient";
  const clientPath = apiClient?.filePath
    ? apiClient.filePath.replace(/^.*?src\//, 'src/')
    : `${apiDir}/index.${ext}`;
  const clientImportAlias = clientPath.replace(/^src\//, '@/').replace(/\.(ts|js)$/, '');
  const importStatement = apiClient?.importStyle === "default"
    ? `import ${clientName} from "${clientImportAlias}";`
    : `import { ${clientName} } from "${clientImportAlias}";`;
  const hasAuth = apiClient?.hasAuth ?? false;
  const hasErrorHandling = apiClient?.hasErrorHandling ?? false;

  const globs = `${apiDir}/**`;
  const metadata = buildRuleMetadata(
    "API Call Guidelines",
    "How to call backend APIs: file location, client usage, error handling",
    80,
    context.techStack.primary,
    ["api", "http"],
    "practice",
    ["global-rules"],
    { globs }
  );

  const clientSection = clientDetected
    ? `## HTTP Client

The project wraps \`${clientName}\` at \`${clientPath}\`:

\`\`\`${ext}
${importStatement}
\`\`\`

${hasAuth ? `> ✅ Built-in auth (token auto-injected); callers need not set Authorization header manually.\n` : ""}
${hasErrorHandling ? `> ✅ Built-in unified error handling (interceptor handles non-2xx responses).\n` : ""}

## Standard Function Structure

\`\`\`${ext}
// ${apiDir}/feature.${ext}
${importStatement}
${isTS ? `import type { FeatureItem, FeatureListParams } from "@/interface/feature";\n` : ""}
export const fetchFeatureList = (${isTS ? "params: FeatureListParams" : "params"}) => {
  return ${clientName}.get${isTS ? "<FeatureItem[]>" : ""}("/features", { params });
};
\`\`\``
    : `## HTTP Client

> ⚠️ Could not auto-detect the project's HTTP client wrapper. Check the project's API request wrapper and ensure calls go through wrapper functions.`;

  const content = metadata + `
# API Call Guidelines

## Core Conventions

- Keep all API functions in \`${apiDir}/\`, split by business module
- **Do not** call \`fetch\`/\`axios.get\` directly in components/stores — use wrapper functions
- Each function does one thing: request + return data (handle side effects at the call site)

${clientSection}

## Do / Don't

\`\`\`${ext}
// ❌ Direct fetch in component
useEffect(() => {
  axios.get("/api/features").then(setList);
}, []);

// ✅ Call wrapper function
useEffect(() => {
  fetchFeatureList({ page: 1, pageSize: 20 }).then(setList);
}, []);
\`\`\`

${!hasErrorHandling ? `## Error Handling

Each API function must handle exceptions, or the caller must try-catch. See also: @error-handling.mdc` : ""}
${generateResponseTypeHint(context)}
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

async function generateResponseTypeHint(context: RuleGenerationContext): Promise<string> {
  const typeDirs = context.fileOrganization?.typesLocation ?? [];
  const typeFiles = (context.files ?? []).filter((f) => {
    const rel = path.relative(context.projectPath, f);
    return typeDirs.some((d) => rel.startsWith(d)) &&
      (rel.endsWith("base.ts") || rel.endsWith("common.ts") || rel.endsWith("response.ts"));
  });

  for (const file of typeFiles.slice(0, 3)) {
    try {
      const content = await FileUtils.readFile(file);
      const match = content.match(/export\s+(?:interface|type)\s+(I?(?:Response|ApiResponse|BaseResponse)\b[^{]*)/);
      if (match) {
        const typeName = match[1].trim().split(/\s/)[0];
        const relPath = path.relative(context.projectPath, file);
        return `\n## Response Type Convention\n\nThe project defines a unified response type \`${typeName}\` in \`${relPath}\`. All API functions should use this type for type-safe responses.\n`;
      }
    } catch {
      // skip unreadable files
    }
  }
  return "";
}
