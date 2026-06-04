/**
 * 自定义工具规则生成器
 *
 * 列出项目自定义 Hooks、工具函数、API 客户端，要求生成代码时优先复用。
 * 同名工具函数标注上下文容器，由 Agent 在调用点就近决策。自包含。
 */

import * as path from "path";

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { FileUtils } from "../../../utils/file-utils.js";
import { buildRuleMetadata } from "./rule-metadata.js";

/**
 * v1.3: 生成自定义工具规则（约 150 行）
 */
export function generateCustomToolsRule(context: RuleGenerationContext): CursorRule {
    const hookGlobs = getHookGlobs(context);
    const metadata = buildRuleMetadata(
      "项目自定义工具",
      "Consult before implementing features — lists project-specific hooks, utilities, and API clients that MUST be reused",
      95,
      context.techStack.primary,
      ["custom-tools", "reference"],
      "reference",
      ["global-rules"],
      hookGlobs ? { globs: hookGlobs } : undefined
    );

    const content =
      metadata +
      `
# 项目自定义工具

参考: @global-rules.mdc

${generateCustomToolsRules(context)}

---

*使用项目工具保持代码一致性，避免重复实现。*
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "custom-tools.mdc",
      priority: 95,
      type: "reference",
      depends: ["global-rules"],
    };
}

function getHookGlobs(context: RuleGenerationContext): string | null {
    // 直接使用 path.dirname 从 hook 文件路径获取其所在目录
    // 不过滤路径名语义或深度：hooks 可能在 composables/、features/xxx/hooks/ 等任意位置
    // 唯一安全过滤：排除绝对路径
    const hookDirs = (context.customPatterns?.customHooks ?? [])
      .map((h) => {
        const dir = path.dirname(h.relativePath);
        // path.dirname('file.ts') → '.' 说明在根目录，跳过
        if (dir === '.' || dir === '') return null;
        const normalized = dir.endsWith('/') ? dir : dir + '/';
        return !path.isAbsolute(normalized) ? normalized : null;
      })
      .filter((d): d is string => d !== null);
    const uniqueDirs = [...new Set(hookDirs)].slice(0, 3);
    if (uniqueDirs.length > 0) {
      return uniqueDirs.map((d) => `${d}**`).join(', ');
    }
    return '**/hooks/**';
}

function generateCustomToolsRules(context: RuleGenerationContext): string {
    if (
      !context.customPatterns ||
      ((!context.customPatterns.customHooks || context.customPatterns.customHooks.length === 0) &&
        (!context.customPatterns.customUtils || context.customPatterns.customUtils.length === 0))
    ) {
      return "";
    }

    let rules = `## 项目自定义工具（优先使用）\n\n`;

    // 自定义 Hooks：按频率分层输出
    if (context.customPatterns.customHooks && context.customPatterns.customHooks.length > 0) {
      rules += `### 自定义 Hooks\n\n`;
      rules += `项目定义了以下自定义 hooks，**生成代码时必须优先使用**：\n\n`;

      const activeHooks = context.customPatterns.customHooks
        .filter((h) => h.frequency > 0)
        .slice(0, 10);

      if (activeHooks.length === 0) {
        rules += `> 项目中的自定义 hooks 尚未检测到使用记录，请参考 @project-structure.mdc 确认 hooks 目录位置。\n\n`;
      }

      for (const hook of activeHooks) {
        // 按频率分层：高(>10) = 强制优先；中(4-10) = 优先使用；低(1-3) = 可选参考
        const freqLabel = hook.frequency > 10 ? "高" : hook.frequency > 3 ? "中" : "低";
        const freqNote = hook.frequency <= 3
          ? ` ⚠️ 低频（仅 ${hook.frequency} 处使用，仅在明确匹配使用场景时优先）`
          : ` (${hook.frequency} 处)`;

        rules += `**${hook.name}** ${hook.description ? `- ${hook.description}` : ""}\n`;
        rules += `- 位置: \`${hook.relativePath}\`\n`;
        rules += `- 使用频率: ${freqLabel}${freqNote}\n`;
        if (hook.usage) {
          rules += `- 使用方式:\n`;
          rules += `  \`\`\`typescript\n`;
          rules += `  ${hook.usage}\n`;
          rules += `  \`\`\`\n`;
        }
        rules += `\n`;
      }
    }

    // 自定义工具函数：同名函数标注上下文容器，由 Agent 在调用点按就近原则决策
    if (context.customPatterns.customUtils && context.customPatterns.customUtils.length > 0) {
      rules += `### 自定义工具函数\n\n`;
      rules += `项目定义了以下工具函数，**生成代码时必须优先使用**：\n\n`;

      // 收集项目依赖名称，用于识别路径中是否包含已知子库段
      const depNames = new Set(
        (context.techStack.dependencies ?? []).map((d) => d.name.toLowerCase())
      );

      const utilsByCategory = groupUtilsByCategory(context.customPatterns.customUtils);

      for (const [category, utils] of Object.entries(utilsByCategory)) {
        rules += `**${category}**:\n`;

        // 分组同名函数
        const nameGroups: Record<string, any[]> = {};
        for (const u of utils) {
          if (!nameGroups[u.name]) nameGroups[u.name] = [];
          nameGroups[u.name].push(u);
        }

        const processedNames = new Set<string>();
        for (const util of utils.slice(0, 5)) {
          if (processedNames.has(util.name)) continue;
          processedNames.add(util.name);

          const group = nameGroups[util.name];
          if (group.length > 1) {
            // 同名函数：不排序，如实标注每个定义所属的上下文容器
            // 由 Agent 在生成代码时按调用点就近原则选择正确版本
            rules += `- \`${util.name}\` — **多处定义，按调用位置就近选择**：\n`;
            for (const g of group) {
              const label = inferContextLabel(g.relativePath, depNames);
              rules += `  - \`${g.relativePath}\` — ${label}\n`;
              if (g.signature) {
                rules += `    \`\`\`typescript\n    ${g.signature}\n    \`\`\`\n`;
              }
            }
          } else {
            rules += `- \`${util.name}\` (${util.relativePath})\n`;
            if (util.signature) {
              rules += `  \`\`\`typescript\n  ${util.signature}\n  \`\`\`\n`;
            }
          }
        }
        rules += `\n`;
      }
    }

    // API 客户端
    const api = context.customPatterns.apiClient;
    if (api?.exists && api.filePath) {
      rules += `### API 客户端\n\n`;
      rules += `项目使用自定义的 API 客户端：**\`${api.name}\`**\n`;
      rules += `- 位置: \`${FileUtils.getRelativePath(
        context.projectPath,
        api.filePath
      )}\`\n`;
      if (api.hasErrorHandling) {
        rules += `- ✅ 已内置错误处理\n`;
      }
      if (api.hasAuth) {
        rules += `- ✅ 已内置认证处理\n`;
      }
      rules += `\n**使用要求**:\n`;
      rules += `\`\`\`typescript\n`;
      rules += `// ✅ 正确 - 使用项目的 API 客户端\n`;
      rules += `import { ${api.name} } from '@/services/${api.name}';\n`;
      rules += `const data = await ${api.name}.get('/endpoint');\n\n`;
      rules += `// ❌ 错误 - 不要直接使用 fetch 或 axios\n`;
      rules += `const response = await fetch('/api/endpoint');\n`;
      rules += `\`\`\`\n\n`;
    }

    rules += `### ⚠️ 重要规则\n\n`;
    rules += `1. **优先使用项目自定义工具**，不要重新实现或引入第三方替代\n`;
    rules += `2. **保持一致性**，使用相同的工具确保代码可维护性\n`;
    rules += `3. **新增工具时**，遵循现有工具的命名和组织方式\n\n`;

    return rules;
}

/**
 * 按类别分组工具函数
 */
function groupUtilsByCategory(utils: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    for (const util of utils) {
      if (!grouped[util.category]) {
        grouped[util.category] = [];
      }
      grouped[util.category].push(util);
    }
    return grouped;
}

/**
 * 推断路径所属的上下文容器标签，用于同名函数的多处定义标注。
 *
 * 判断依据（按优先级）：
 * 1. 路径中某段与已知依赖名匹配 → 识别为该依赖的子库
 * 2. 路径中存在 vendor / third-party 等惯用段 → 外部库
 * 3. 路径中的 feature / module 级目录名 → 业务模块
 * 4. 其余情况 → 主项目
 *
 * 注意：此方法只做上下文描述，不做优先级排序。
 * 优先级由 Agent 在生成代码时根据调用点就近决策。
 */
function inferContextLabel(relativePath: string, depNames: Set<string>): string {
    const segments = relativePath.split('/').map((s) => s.toLowerCase());

    // 1. 路径中某段命中已知依赖名 → 子库
    for (const seg of segments) {
      if (depNames.has(seg)) {
        return `${seg} 子库`;
      }
    }

    // 2. 惯用的外部/vendored 路径段
    const VENDOR_SEGMENTS = new Set(['vendor', 'third-party', 'thirdparty', 'external']);
    for (const seg of segments) {
      if (VENDOR_SEGMENTS.has(seg)) {
        return `外部库（${seg}/）`;
      }
    }

    // 3. 识别 feature / module 业务级目录（非根级 src/）
    const FEATURE_SEGMENTS = new Set(['features', 'modules', 'pages', 'views', 'domains']);
    for (let i = 0; i < segments.length - 1; i++) {
      if (FEATURE_SEGMENTS.has(segments[i])) {
        return `${segments[i + 1]} 模块`;
      }
    }

    // 4. 默认：主项目
    return '主项目';
}
