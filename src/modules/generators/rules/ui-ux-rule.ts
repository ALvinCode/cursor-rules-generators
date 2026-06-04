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
    styleApproach = "antd 组件 + styled-components 自定义样式";
  } else if (hasAntd && hasLess) {
    styleApproach = "antd 组件 + Less 变量覆盖";
  } else if (hasAntd) {
    styleApproach = "antd 组件库";
  } else if (hasMui) {
    styleApproach = "Material UI";
  } else if (hasShadcn) {
    styleApproach = "shadcn/ui + Radix UI";
  } else if (hasTailwind) {
    styleApproach = "Tailwind CSS";
  } else {
    styleApproach = "自定义 CSS/CSS Modules";
  }

  let content = `## 项目 UI 方案\n\n`;
  content += `**当前使用**: ${styleApproach}\n\n`;

  if (hasAntd) {
    content += `### Antd 使用约定\n\n`;
    content += `**Do ✅**\n`;
    content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
    content += `// 优先使用 antd 原生 API，不要重复封装已有能力\n`;
    content += `import { Table, Form, Modal, Button, Space } from "antd";\n\n`;
    content += `// Form 使用 Form.useForm()，不要直接 ref\n`;
    content += `const [form] = Form.useForm();\n\n`;
    content += `// Table 分页统一走 onChange 回调\n`;
    content += `<Table\n`;
    content += `  dataSource={data}\n`;
    content += `  columns={columns}\n`;
    content += `  pagination={{ current, pageSize, total, onChange: handlePageChange }}\n`;
    content += `/>;\n`;
    content += `\`\`\`\n\n`;

    content += `**Don't ❌**\n`;
    content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
    content += `// 不要用原生 <button> 替代 antd Button\n`;
    content += `<button onClick={…}>提交</button>\n\n`;
    content += `// 不要重新实现 antd 已有的 Modal.confirm / message.error\n`;
    content += `const MyAlert = () => <div className="alert">{msg}</div>;\n`;
    content += `\`\`\`\n\n`;

    content += `### 常用场景\n\n`;
    content += `| 场景 | 使用组件 |\n`;
    content += `|------|---------|\n`;
    content += `| 数据列表 | \`Table\` + \`useTable\` hook |\n`;
    content += `| 表单提交 | \`Form\` + \`Form.useForm()\` |\n`;
    content += `| 确认弹窗 | \`Modal.confirm()\` |\n`;
    content += `| 操作反馈 | \`message.success/error()\` |\n`;
    content += `| 加载状态 | \`Spin\` 或 Table \`loading\` prop |\n\n`;
  }

  if (hasStyledComponents) {
    content += `### Styled-components 约定\n\n`;
    content += `\`\`\`${isTS ? "tsx" : "jsx"}\n`;
    content += `// 命名：S + PascalCase（避免与组件名冲突）\n`;
    content += `const SWrapper = styled.div\`\n`;
    content += `  padding: 16px;\n`;
    content += `  background: \${({ theme }) => theme.colors.background};\n`;
    content += `\`;\n\n`;
    content += `// 不要内联大块 CSS，抽出命名 styled 组件\n`;
    content += `\`\`\`\n\n`;
  } else if (hasTailwind) {
    content += `### Tailwind 约定\n\n`;
    content += `- 复杂样式组合提取为 \`@apply\` 或 styled 组件，不要行内堆砌超过 8 个 class\n`;
    content += `- 响应式前缀顺序：\`sm:\` → \`md:\` → \`lg:\`\n\n`;
  }

  content += `### 无障碍（A11y）最低要求\n\n`;
  content += `- 交互元素必须有 \`aria-label\` 或可见文本\n`;
  content += `- 图标按钮加 \`title\` 属性\n`;
  content += `- 表单字段关联 \`label\`（htmlFor）\n\n`;

  return content;
}

/**
 * 生成 UI/UX 设计规范规则文件。
 */
export function generateUIUXRule(context: RuleGenerationContext): CursorRule {
  // 收窄到 components/views 目录，避免所有 tsx 文件都触发
  const org = context.fileOrganization;
  const compDir = org?.componentLocation?.[0]?.replace(/\/$/, '') || 'src/components';
  const viewDir = 'src/views';
  const uiGlobs = `${compDir}/**/*.{tsx,jsx,vue,svelte}, ${viewDir}/**/*.{tsx,jsx,vue,svelte}`;
  const metadata = buildRuleMetadata(
    "UI/UX 设计规范",
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
# UI/UX 设计规范

参考: @global-rules.mdc, @code-style.mdc

${generateUIUXGuidelines(context)}

---

*UI/UX 规范确保良好的用户体验和无障碍访问。*
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
