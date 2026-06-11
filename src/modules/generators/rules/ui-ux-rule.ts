/**
 * UI/UX 设计规范规则生成器
 *
 * 基于项目实际 UI 库（antd / MUI / shadcn / Tailwind 等）与样式方案生成组件使用约定。
 * `generateUIUXGuidelines` 同时被 feature-recipe 的开发指南复用，故一并导出。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";

/**
 * 基于项目 UI 库与样式方案生成 UI/UX 规范片段。
 */
export function generateUIUXGuidelines(context: RuleGenerationContext): string {
  const deps = context.techStack.dependencies || [];
  // 基于"真实使用"的 UI 库（代码扫描裁定）而非仅安装，避免输出未实际使用的库规范
  const activeUINames = new Set(
    (context.uiLibraries?.active ?? []).map((l) => l.name)
  );
  const hasAntd = activeUINames.has("Ant Design");
  const hasMui = activeUINames.has("Material UI");
  const hasShadcn = activeUINames.has("shadcn/ui (Radix)");
  const hasStyledComponents = activeUINames.has("styled-components");
  const hasTailwind = activeUINames.has("Tailwind CSS");
  // Less 是 CSS 预处理器（非组件库），仍按安装检测作为辅助样式信息
  const hasLess = deps.some((d) => d.name === "less");
  const isTS = context.techStack.languages.includes("TypeScript");

  // 确定样式方案描述
  let styleApproach = "";
  if (hasAntd && hasStyledComponents) {
    styleApproach = "antd components + styled-components custom styling";
  } else if (hasAntd && hasLess) {
    styleApproach = "antd components + Less variable overrides";
  } else if (hasAntd) {
    styleApproach = "antd component library";
  } else if (hasMui) {
    styleApproach = "Material UI";
  } else if (hasShadcn) {
    styleApproach = "shadcn/ui + Radix UI";
  } else if (hasTailwind) {
    styleApproach = "Tailwind CSS";
  } else {
    styleApproach = "Custom CSS/CSS Modules";
  }

  let content = `## Project UI Stack\n\n`;
  content += `**Currently using**: ${styleApproach}\n\n`;

  if (hasAntd) {
    content += `### Ant Design Conventions\n\n`;
    content += `**Do ✅**\n`;
    content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
    content += `// Prefer antd native APIs — do not re-wrap existing capabilities\n`;
    content += `import { Table, Form, Modal, Button, Space } from "antd";\n\n`;
    content += `// Use Form.useForm() — do not use a raw ref\n`;
    content += `const [form] = Form.useForm();\n\n`;
    content += `// Table pagination via onChange callback\n`;
    content += `<Table\n`;
    content += `  dataSource={data}\n`;
    content += `  columns={columns}\n`;
    content += `  pagination={{ current, pageSize, total, onChange: handlePageChange }}\n`;
    content += `/>;\n`;
    content += `\`\`\`\n\n`;

    content += `**Don't ❌**\n`;
    content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
    content += `// Do not use native <button> instead of antd Button\n`;
    content += `<button onClick={…}>Submit</button>\n\n`;
    content += `// Do not reimplement antd Modal.confirm / message.error\n`;
    content += `const MyAlert = () => <div className="alert">{msg}</div>;\n`;
    content += `\`\`\`\n\n`;

    content += `### Common Scenarios\n\n`;
    content += `| Scenario | Components |\n`;
    content += `|----------|------------|\n`;
    content += `| Data lists | \`Table\` + \`useTable\` hook |\n`;
    content += `| Form submission | \`Form\` + \`Form.useForm()\` |\n`;
    content += `| Confirmation dialogs | \`Modal.confirm()\` |\n`;
    content += `| Action feedback | \`message.success/error()\` |\n`;
    content += `| Loading states | \`Spin\` or Table \`loading\` prop |\n\n`;
  }

  if (hasStyledComponents) {
    content += `### Styled-components Conventions\n\n`;
    content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
    content += `// Naming: S + PascalCase (avoids clashing with component names)\n`;
    content += `const SWrapper = styled.div\`\n`;
    content += `  padding: 16px;\n`;
    content += `  background: \${({ theme }) => theme.colors.background};\n`;
    content += `\`;\n\n`;
    content += `// Do not inline large CSS blocks — extract named styled components\n`;
    content += `\`\`\`\n\n`;
  } else if (hasTailwind) {
    content += `### Tailwind Conventions\n\n`;
    content += `- Extract complex class combinations into \`@apply\` or styled components — avoid stacking more than 8 inline classes\n`;
    content += `- Responsive prefix order: \`sm:\` → \`md:\` → \`lg:\`\n\n`;
  }

  content += `### Accessibility (A11y) Minimum Requirements\n\n`;
  content += `- Interactive elements must have \`aria-label\` or visible text\n`;
  content += `- Icon buttons must include a \`title\` attribute\n`;
  content += `- Form fields must be associated with a \`label\` (htmlFor)\n\n`;

  return content;
}

/**
 * 生成 UI/UX 设计规范规则文件。
 */
export function generateUIUXRule(context: RuleGenerationContext): CursorRule {
  // 收窄到 components/views 目录，文件扩展名根据项目实际框架动态决定
  const org = context.fileOrganization;
  const compDir = org?.componentLocation?.[0]?.replace(/\/$/, '') || 'src/components';
  const viewDir = 'src/views';
  const frameworks = context.techStack.frameworks.map((f) => f.toLowerCase());
  const uiExts: string[] = [];
  if (frameworks.some((f) => f.includes("react") || f.includes("next") || f.includes("preact"))) {
    uiExts.push("tsx", "jsx");
  }
  if (frameworks.includes("vue") || frameworks.includes("nuxt")) {
    uiExts.push("vue");
  }
  if (frameworks.includes("svelte")) {
    uiExts.push("svelte");
  }
  if (frameworks.includes("astro")) {
    uiExts.push("astro");
  }
  if (uiExts.length === 0) uiExts.push("tsx", "jsx");
  const extGlob = uiExts.length === 1 ? `*.${uiExts[0]}` : `*.{${uiExts.join(",")}}`;
  const uiGlobs = `${compDir}/**/${extGlob}, ${viewDir}/**/${extGlob}`;
  const metadata = buildRuleMetadata(
    "UI/UX Guidelines",
    "UI component patterns and conventions for this project's UI library",
    75,
    context.techStack.primary,
    ["ui-ux", "frontend"],
    "guideline",
    ["global-rules", "code-style"],
    { globs: uiGlobs }
  );

  const content =
    metadata +
    `
# UI/UX Guidelines

See also: @global-rules.mdc, @code-style.mdc

${generateUIUXGuidelines(context)}

---

*UI/UX guidelines ensure good user experience and accessibility.*
`;

  return {
    scope: "specialized",
    modulePath: context.projectPath,
    content,
    fileName: "ui-ux.mdc",
    priority: 75,
    type: "guideline",
    depends: ["global-rules", "code-style"],
  };
}
