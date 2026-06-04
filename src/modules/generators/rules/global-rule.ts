/**
 * 全局概述规则生成器
 *
 * 生成 always-applied 的项目全局规则：persona、技术栈、命令、硬约束、规则索引。
 * 规则索引依据各特征是否存在动态列出对应规则文件。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import {
  getProjectName,
  generatePersona,
  generateVersionedTechStack,
  generateCommandsSection,
  generatePostCodingConstraint,
  isFrontendProject,
  featureExists,
  detectTestFramework,
  hasCustomTools,
  hasErrorHandling,
  hasStateManagement,
} from "./rule-helpers.js";

/**
 * v1.3: 生成全局概述规则（约 280 行）
 */
export function generateGlobalOverviewRule(
  context: RuleGenerationContext
): CursorRule {
    const metadata = buildRuleMetadata(
      `${getProjectName(context.projectPath)} - 全局规则`,
      "Project-wide conventions, tech stack, and core development principles. Always loaded.",
      100,
      context.techStack.primary,
      ["global", "overview"],
      "overview",
      undefined,
      { alwaysApply: true }
    );

    const persona = generatePersona(context);

    const techVersions = generateVersionedTechStack(context);
    const commandsSection = generateCommandsSection(context);

    const content =
      metadata +
      `# ${getProjectName(context.projectPath)}

${persona}

## Tech Stack

${techVersions}
${commandsSection}
## Hard Constraints

- NEVER use \`any\` type. Use \`unknown\` and narrow with type guards.
- NEVER swallow errors with empty catch blocks. Log and re-throw or handle explicitly.
- NEVER create duplicate utilities. Check @custom-tools.mdc before writing helpers.
- NEVER generate markdown documentation files — express intent through code, types, and naming.
- Before creating files, consult @project-structure.mdc for correct location.
- Reuse existing project tools — do not re-implement what already exists.
- Follow the project's established patterns and conventions.
${generatePostCodingConstraint(context)}
${
  context.techStack.frameworks.length > 0
    ? `\n${generateFrameworkPrinciples(context)}\n`
    : ""
}
## Rule Index

| Rule | Scope |
|------|-------|
| @code-style.mdc | Formatting and naming conventions |
| @project-structure.mdc | Directory layout and file placement |
| @architecture.mdc | Module structure and design patterns |
${hasCustomTools(context) ? "| @custom-tools.mdc | Project-specific hooks, utils, API clients |\n" : ""}${hasErrorHandling(context) ? "| @error-handling.mdc | Error handling and logging patterns |\n" : ""}${hasStateManagement(context) ? "| @state-management.mdc | State management conventions |\n" : ""}${context.frontendRouter ? "| @frontend-routing.mdc | Frontend routing patterns |\n" : ""}${context.backendRouter ? "| @api-routing.mdc | API endpoint conventions |\n" : ""}${isFrontendProject(context) ? "| @ui-ux.mdc | UI component and UX patterns |\n" : ""}${(isFrontendProject(context) && (context.customPatterns?.apiClient?.exists || context.techStack.dependencies.some((d) => d.name === "axios"))) ? "| @api-patterns.mdc | API call conventions and HTTP client usage |\n" : ""}${isFrontendProject(context) ? "| @feature-recipe.mdc | End-to-end guide for adding a new feature |\n" : ""}${(featureExists(context, "testing") || detectTestFramework(context) !== null) ? "| @testing.mdc | Testing patterns and organization |\n" : ""}
`;

    return {
      scope: "global",
      modulePath: context.projectPath,
      content,
      fileName: "global-rules.mdc",
      priority: 100,
      type: "overview",
    };
}

/**
 * 生成框架特定原则（增强版，参考 awesome-cursorrules）
 */
function generateFrameworkPrinciples(context: RuleGenerationContext): string {
    const frameworks = context.techStack.frameworks;
    let principles = "";

    if (frameworks.includes("React")) {
      principles += `- **React**: 
  - 使用函数组件和 Hooks，避免类组件
  - 保持组件单一职责原则
  - 合理使用 \`useMemo\` 和 \`useCallback\` 优化性能
  - 使用 TypeScript 进行类型检查
`;
    }
    if (frameworks.includes("Vue")) {
      principles += `- **Vue**: 
  - 使用 Composition API（Vue 3）
  - 保持组件模板简洁
  - 复杂逻辑抽取到 composables
  - 使用 TypeScript 增强类型安全
`;
    }
    if (frameworks.includes("Next.js")) {
      principles += `- **Next.js**: 
  - 优先使用 App Router（如果项目使用）
  - Server Components 中进行数据获取
  - 使用 \`next/image\` 优化图片
  - 配置适当的元数据以改善 SEO
  - 最小化 'use client' 使用，优先使用 Server Components
`;
    }
    if (frameworks.includes("Angular")) {
      principles += `- **Angular**: 
  - 使用组件和模块化架构
  - 遵循 Angular 风格指南
  - 使用 TypeScript 和依赖注入
`;
    }
    if (frameworks.includes("Svelte")) {
      principles += `- **Svelte**: 
  - 利用 Svelte 的编译时优化
  - 使用响应式声明和语句
  - 保持组件简洁和高效
`;
    }

    return principles || "- 遵循框架的官方最佳实践";
}
