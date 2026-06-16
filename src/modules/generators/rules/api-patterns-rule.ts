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

  // Sample a real business name from pages/views for example naming
  const PAGE_KW = new Set(['views', 'pages', 'screens']);
  const pageDirs = (context.deepAnalysis ?? []).filter((d) => {
    if (d.depth < 2) return false;
    const parent = d.path.split('/').slice(-2, -1)[0]?.toLowerCase() ?? '';
    if (!PAGE_KW.has(parent)) return false;
    return /^[a-zA-Z]/.test(d.path.split('/').pop() ?? '');
  });
  let bizName = 'Feature';
  if (pageDirs.length > 0) {
    bizName = pageDirs[0].path.split('/').pop()!.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s/g, '');
  } else {
    // Fallback: sample from api or interfaces/types directory files
    const sampleDirs = [...(context.fileOrganization?.apiLocation ?? []), ...(context.fileOrganization?.typesLocation ?? [])];
    const sampleFile = (context.files ?? []).find((f) => {
      const rel = path.relative(context.projectPath, f);
      return sampleDirs.some((d) => rel.startsWith(d)) && /^[a-zA-Z]/.test(path.basename(f)) && !path.basename(f).startsWith('index') && !path.basename(f).startsWith('base');
    });
    if (sampleFile) {
      bizName = path.basename(sampleFile, path.extname(sampleFile)).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s/g, '');
    }
  }
  const bizLower = bizName.charAt(0).toLowerCase() + bizName.slice(1);
  const typeDir = context.fileOrganization?.typesLocation?.[0] || 'src/types';
  const typeAlias = typeDir.replace(/^src\//, '@/');

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

> Examples below use **${bizName}** as a representative module — adapt names to your actual feature.

\`\`\`${ext}
// ${apiDir}/${bizLower}.${ext}
${importStatement}
${isTS ? `import type { ${bizName}Item, ${bizName}ListParams } from "${typeAlias}/${bizLower}";\n` : ""}
export const fetch${bizName}List = (${isTS ? `params: ${bizName}ListParams` : "params"}) => {
  return ${clientName}.get${isTS ? `<${bizName}Item[]>` : ""}("/${bizLower}s", { params });
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
  fetch${bizName}List({ page: 1, pageSize: 20 }).then(setList);
}, []);
\`\`\`

${!hasErrorHandling ? `## Error Handling

Each API function must handle exceptions, or the caller must try-catch. See also: @error-handling.mdc` : ""}
${await generateResponseTypeHint(context)}
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
      const match = content.match(/export\s+(?:interface|type)\s+(I?(?:Response|ApiResponse|BaseResponse)\w*)/);
      if (match) {
        const typeName = match[1].trim();
        const relPath = path.relative(context.projectPath, file);
        return `\n## Response Type Convention\n\nThe project defines a unified response type \`${typeName}\` in \`${relPath}\`. All API functions should use this type for type-safe responses.\n`;
      }
    } catch {
      // skip unreadable files
    }
  }
  return "";
}
