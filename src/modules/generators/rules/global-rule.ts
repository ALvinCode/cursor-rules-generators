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
  isJsTsProject,
  isFrontendProject,
  featureExists,
  detectTestFramework,
  hasCustomTools,
  hasStateManagement,
  getPlatformSections,
} from "./rule-helpers.js";

/**
 * v1.3: 生成全局概述规则（约 280 行）
 */
export function generateGlobalOverviewRule(
  context: RuleGenerationContext
): CursorRule {
    const metadata = buildRuleMetadata(
      `${getProjectName(context.projectPath)} - Global Rules`,
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
    const platformGlobal = getPlatformSections(context, "global-overview");

    const content =
      metadata +
      `# ${getProjectName(context.projectPath)}

${persona}

## Tech Stack

${techVersions}
${commandsSection}
## Hard Constraints

${isJsTsProject(context) && !isAnyAllowed(context) ? `- NEVER use \`any\` type. Use \`unknown\` and narrow with type guards.\n` : ""}- NEVER swallow errors with empty catch blocks. Log and re-throw or handle explicitly.
- NEVER create duplicate utilities. Check @custom-tools.mdc before writing helpers.
- NEVER generate markdown documentation files — express intent through code, types, and naming.
- Before creating files, consult @project-structure.mdc for correct location.
- Reuse existing project tools — do not re-implement what already exists.
- Follow the project's established patterns and conventions.
${generatePostCodingConstraint(context)}
${context.projectConfig?.commitConvention ? `- Follow **Conventional Commits** for commit messages (enforced by commitlint + husky).\n` : ""}
${
  context.techStack.frameworks.length > 0
    ? `\n${generateFrameworkPrinciples(context)}\n`
    : ""
}${platformGlobal ? `\n${platformGlobal}\n` : ""}
## Rule Index

| Rule | Scope |
|------|-------|
| @code-style.mdc | Formatting and naming conventions |
| @project-structure.mdc | Directory layout and file placement |
${hasArchitectureValue(context) ? "| @architecture.mdc | Module structure and design patterns |\n" : ""}${hasCustomTools(context) ? "| @custom-tools.mdc | Project-specific hooks, utils, API clients |\n" : ""}${hasErrorHandlingValue(context) ? "| @error-handling.mdc | Error handling and logging patterns |\n" : ""}${hasStateManagement(context) ? "| @state-management.mdc | State management conventions |\n" : ""}${context.frontendRouter ? "| @frontend-routing.mdc | Frontend routing patterns |\n" : ""}${context.backendRouter ? "| @api-routing.mdc | API endpoint conventions |\n" : ""}${isFrontendProject(context) ? "| @ui-ux.mdc | UI component and UX patterns |\n" : ""}${(isFrontendProject(context) && (context.customPatterns?.apiClient?.exists || context.techStack.dependencies.some((d) => d.name === "axios"))) ? "| @api-patterns.mdc | API call conventions and HTTP client usage |\n" : ""}${isFrontendProject(context) ? "| @feature-recipe.mdc | End-to-end guide for adding a new feature |\n" : ""}${(featureExists(context, "testing") || detectTestFramework(context) !== null || !!(context.projectConfig?.commands?.lint || context.projectConfig?.commands?.typeCheck)) ? "| @testing.mdc | Testing and verification commands |\n" : ""}
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
  - Use function components and Hooks; avoid class components
  - Keep components focused on a single responsibility
  - Use \`useMemo\` and \`useCallback\` judiciously for performance
  - Use TypeScript for type checking
`;
    }
    if (frameworks.includes("Vue")) {
      principles += `- **Vue**: 
  - Use Composition API (Vue 3)
  - Keep component templates concise
  - Extract complex logic into composables
  - Use TypeScript for stronger type safety
`;
    }
    if (frameworks.includes("Next.js")) {
      principles += `- **Next.js**: 
  - Prefer App Router when the project uses it
  - Fetch data in Server Components
  - Use \`next/image\` for image optimization
  - Configure appropriate metadata for SEO
  - Minimize \`use client\`; prefer Server Components
`;
    }
    if (frameworks.includes("Angular")) {
      principles += `- **Angular**: 
  - Use components and a modular architecture
  - Follow the Angular style guide
  - Use TypeScript and dependency injection
`;
    }
    if (frameworks.includes("Svelte")) {
      principles += `- **Svelte**: 
  - Leverage Svelte's compile-time optimizations
  - Use reactive declarations and statements
  - Keep components concise and efficient
`;
    }

    return principles || "- Follow the framework's official best practices";
}

/**
 * Whether the project's ESLint config explicitly allows `any`.
 * When true, the "NEVER use any" constraint is suppressed.
 */
function isAnyAllowed(context: RuleGenerationContext): boolean {
    const rule = context.projectConfig?.eslint?.rules?.["@typescript-eslint/no-explicit-any"];
    if (rule === "off" || rule === 0) return true;
    if (Array.isArray(rule) && (rule[0] === "off" || rule[0] === 0)) return true;
    return false;
}

/**
 * architecture.mdc only when there's concrete structural detail
 * (layer/feature structure, multi-module, platform sections, or substantial practices).
 */
function hasArchitectureValue(context: RuleGenerationContext): boolean {
    const p = context.architecturePattern;
    const meaningfulDirCategories = new Set(
      (context.deepAnalysis ?? [])
        .filter((d) => d.category && d.category !== "other")
        .map((d) => d.category)
    );
    return !!(
      p?.layerStructure ||
      p?.featureStructure ||
      context.modules.length > 1 ||
      meaningfulDirCategories.size >= 3
    );
}

/**
 * error-handling.mdc when the project has distinctive error handling
 * (custom error types, a dedicated logger library, or an API client with built-in error handling).
 */
function hasErrorHandlingValue(context: RuleGenerationContext): boolean {
    const eh = context.projectPractice?.errorHandling;
    return (
      (eh?.customErrorTypes?.length ?? 0) > 0 ||
      (eh?.loggingMethod === "logger-library" && !!eh?.loggerLibrary) ||
      context.customPatterns?.apiClient?.hasErrorHandling === true
    );
}
