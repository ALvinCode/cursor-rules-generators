/**
 * 代码风格规则生成器
 *
 * 基于项目配置（Prettier/ESLint）或分析出的实践生成代码风格约定。
 * `generateCodeStyleGuidelines` 同时被 module 生成器复用，故导出。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import type { ExtractedBestPractice } from "../best-practice-extractor.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import { getLanguageGlobs, formatMissingPractices, isJsTsProject, getPlatformSections } from "./rule-helpers.js";

/**
 * v1.3: 生成代码风格规则（约 200 行）
 * v1.5: 补充缺失的最佳实践
 */
export function generateCodeStyleRule(
  context: RuleGenerationContext,
  missingPractices?: ExtractedBestPractice[]
): CursorRule {
    const langGlobs = getLanguageGlobs(context);
    const metadata = buildRuleMetadata(
      "Code Style Guidelines",
      "Code style, formatting, and naming conventions derived from project config",
      90,
      context.techStack.primary,
      ["style", "formatting"],
      "guideline",
      ["global-rules"],
      { globs: langGlobs }
    );

    // 补充缺失的最佳实践
    const codeStylePractices =
      missingPractices?.filter((p) => p.category === "code-style") || [];
    const additionalPractices = formatMissingPractices(codeStylePractices);

    const platformStyle = getPlatformSections(context, "code-style");
    const content =
      metadata +
      `
# Code Style

${
  context.projectConfig
    ? generateConfigBasedStyleRules(context)
    : generateCodeStyleGuidelines(context)
}

${isJsTsProject(context) ? `## Do / Don't

\`\`\`typescript
// DON'T: use any — loses type safety
function process(data: any) { return data.value; }

// DO: use precise types
function process(data: ProcessInput): ProcessOutput {
  return data.value;
}
\`\`\`

\`\`\`typescript
// DON'T: implicit typing + mutable default
var count = 0;

// DO: explicit types + prefer immutability
const count: number = 0;
\`\`\`

` : ""}> See **@error-handling.mdc** for error handling conventions

${generateTechSpecificConventions(context)}${additionalPractices ? `## Additional Best Practices\n\n${additionalPractices}\n` : ""}${platformStyle ? `\n${platformStyle}\n` : ""}
`;

    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content,
      fileName: "code-style.mdc",
      priority: 90,
      type: "guideline",
      depends: ["global-rules"],
    };
}

/**
 * 生成通用代码风格指南（语言无关 + 语言特定）。
 */
function generateCodeStyleGuidelines(context: RuleGenerationContext): string {
    let style = `## General Guidelines

- Use meaningful variable and function names
- Keep functions short with a single responsibility
- Add comments that explain "why", not "what"
- Keep formatting consistent

`;

    // 根据语言添加特定风格
    if (
      context.techStack.languages.includes("JavaScript") ||
      context.techStack.languages.includes("TypeScript")
    ) {
      style += generateJavaScriptStyleGuide(context);
    }

    if (context.techStack.languages.includes("Python")) {
      style += generatePythonStyleGuide();
    }

    // 添加格式化和命名约定
    style += generateFormattingRules(context);
    style += generateNamingConventions(context);

    return style;
}

/**
 * 生成 JavaScript/TypeScript 风格指南
 */
function generateJavaScriptStyleGuide(context: RuleGenerationContext): string {
    const isTypeScript = context.techStack.languages.includes("TypeScript");

    return `## JavaScript/TypeScript Code Style

### Basics
- Use \`const\` and \`let\`; avoid \`var\`
- Prefer arrow functions
- Use template strings instead of string concatenation
- Use destructuring to simplify code
- Use async/await for asynchronous operations

### Formatting Rules
- **Strings**: Prefer single quotes \`'string'\`; use backticks \`\\\`template\\\`\` when interpolation is needed
- **Semicolons**: Be consistent (semicolons recommended)
- **Line length**: Limit lines to 100 characters
- **Indentation**: Use 2 spaces (or follow project config)
- **Trailing commas**: Add a trailing comma on the last item in multiline objects/arrays

### Code Organization
- **Import order**:
  1. External library imports
  2. Internal module imports
  3. Relative path imports
  ${isTypeScript ? "4. Type imports (use `import type`)" : ""}
- **Exports**: Prefer named exports over default exports (better maintainability)

${
  isTypeScript
    ? `### TypeScript-Specific Guidelines
- Prefer \`interface\` for object types
- Use \`type\` for unions and utility types
- Avoid \`any\`; use \`unknown\` instead
- Add explicit types for function parameters and return values
- Use strict mode (\`strict: true\`)
- Prefer type guards over type assertions
`
    : ""
}
`;
}

/**
 * 生成 Python 风格指南
 */
function generatePythonStyleGuide(): string {
    return `## Python Code Style

### PEP 8
- **Indentation**: Use 4 spaces
- **Line length**: Limit lines to 79 characters (72 for docstrings/comments)
- **Blank lines**:
  - 2 blank lines between top-level function and class definitions
  - 1 blank line between methods inside a class
- **String quotes**: Be consistent (single quotes recommended)

### Naming Conventions
- **Functions/variables**: snake_case (e.g., \`get_user_data\`)
- **Classes**: PascalCase (e.g., \`UserProfile\`)
- **Constants**: UPPER_CASE (e.g., \`MAX_RETRY_COUNT\`)
- **Private attributes**: single leading underscore (e.g., \`_internal_method\`)
- **Special methods**: double underscores on both sides (e.g., \`__init__\`)

### Import Conventions
- **Import order**:
  1. Standard library imports
  2. Third-party library imports
  3. Local application/library imports
- One blank line between each group
- Avoid wildcard imports (\`from module import *\`)

### Type Annotations
- Add type annotations for function parameters
- Add type annotations for return values
- Use types from the \`typing\` module (List, Dict, Optional, etc.)
- Use \`mypy\` for static type checking

`;
}

/**
 * 生成格式化规则
 */
function generateFormattingRules(context: RuleGenerationContext): string {
    return `## Code Formatting

### Spacing and Indentation
- Add spaces around operators: \`a + b\` not \`a+b\`
- Add a space after commas: \`[1, 2, 3]\` not \`[1,2,3]\`
- Add a space after keywords: \`if (condition)\` not \`if(condition)\`
- Do not add spaces inside parentheses: \`func(a, b)\` not \`func( a, b )\`

### Code Blocks
- Always use braces, even for single-line code
- Put \`else\` on the same line as the closing brace (JavaScript/TypeScript)
- Do not break before the opening brace (K&R style)

### Comments
- Use \`//\` for single-line comments (JavaScript/TypeScript) or \`#\` (Python)
- Use \`/* */\` for multiline comments (JavaScript/TypeScript) or \`"""\` (Python)
- Comments should explain "why", not "what"
- Keep comments in sync with the code

`;
}

/**
 * 生成命名约定
 */
function generateNamingConventions(context: RuleGenerationContext): string {
    return `## Naming Conventions

### General Rules
- **Components/classes/interfaces**: PascalCase
  - Examples: \`UserProfile\`, \`DataService\`, \`IUserRepository\`
- **Variables/functions/methods**: camelCase
  - Examples: \`userName\`, \`getUserData()\`, \`handleClick()\`
- **Constants**: UPPER_CASE
  - Examples: \`MAX_RETRY_COUNT\`, \`API_BASE_URL\`, \`DEFAULT_TIMEOUT\`
- **Private properties**: prefix with \`_\` (convention) or use \`#\` (JavaScript private fields)
  - Examples: \`_privateMethod\`, \`#privateField\`

### File Naming
${generateFileNamingRules(context)}

### Specific Cases
- **Boolean variables**: use \`is\`, \`has\`, or \`should\` prefixes
  - Examples: \`isActive\`, \`hasPermission\`, \`shouldUpdate\`
- **Event handlers**: use \`handle\` or \`on\` prefixes
  - Examples: \`handleClick\`, \`onSubmit\`, \`handleUserLogin\`
- **Getters/setters**: use \`get\`/\`set\` prefixes
  - Examples: \`getUser\`, \`setUser\`, \`getUserName\`

### Names to Avoid
- ❌ Single-letter variables (except loop counters \`i\`, \`j\`, \`k\`)
- ❌ Abbreviations and shorthand (unless widely known, e.g., \`URL\`, \`HTTP\`)
- ❌ Hungarian notation (e.g., \`strName\`, \`intCount\`)
- ❌ Meaningless names (e.g., \`data\`, \`temp\`, \`foo\`, \`bar\`)

`;
}

/**
 * 生成文件命名规则
 */
function generateFileNamingRules(context: RuleGenerationContext): string {
    const hasReact = context.techStack.frameworks.includes("React");
    const hasVue = context.techStack.frameworks.includes("Vue");

    let rules = "";

    if (hasReact) {
      rules += `- **React components**: PascalCase.tsx/jsx
  - Examples: \`UserProfile.tsx\`, \`Button.tsx\`
`;
    }

    if (hasVue) {
      rules += `- **Vue components**: PascalCase.vue or kebab-case.vue
  - Examples: \`UserProfile.vue\` or \`user-profile.vue\`
`;
    }

    rules += `- **Utility/helper files**: camelCase or kebab-case
  - Examples: \`formatDate.ts\`, \`api-client.ts\`
- **Type definition files**: types.ts or interfaces.ts
- **Test files**: same name as source file + \`.test\` or \`.spec\`
  - Examples: \`UserProfile.test.tsx\`, \`utils.spec.ts\`
`;

    return rules;
}

/**
 * 生成基于项目配置的代码风格规则（v1.2）
 */
function generateConfigBasedStyleRules(context: RuleGenerationContext): string {
    if (!context.projectConfig) {
      return generateCodeStyleGuidelines(context);
    }

    let rules = `## Code Style (Project Config)\n\n`;

    // 使用项目实际配置
    if (context.projectConfig.prettier) {
      const p = context.projectConfig.prettier;
      rules += `### Project Config (Prettier)\n\n`;
      rules += `This project uses Prettier for code formatting with the following settings:\n\n`;
      rules += `- **Indentation**: ${
        p.useTabs ? "Tab" : `${p.tabWidth || 2} spaces`
      }\n`;
      rules += `- **Quotes**: ${p.singleQuote ? "single quotes" : "double quotes"}\n`;
      rules += `- **Semicolons**: ${p.semi ? "use semicolons" : "omit semicolons"}\n`;
      rules += `- **Line length**: ${p.printWidth || 80} characters\n`;
      rules += `- **Trailing commas**: ${p.trailingComma || "none"}\n\n`;
      rules += `**Config file**: @.prettierrc\n\n`;

      rules += `### Formatting Requirements\n\n`;
      rules += `Follow the Prettier settings above when generating code:\n`;
      rules += `- Wrap strings in ${p.singleQuote ? "single quotes" : "double quotes"}\n`;
      rules += `- Indent with ${
        p.useTabs ? "tabs" : `${p.tabWidth || 2} spaces`
      }\n`;
      rules += `- ${p.semi ? "Include" : "Omit"} semicolons\n\n`;
    } else if (context.projectPractice?.codeStyle) {
      // 使用分析出的代码风格：仅输出能明确判定的项，"mixed"/不确定的项一律省略，
      // 避免产出对 AI 无指导价值的「混合」占位内容（置信度闸门）
      const style = context.projectPractice.codeStyle;
      const isTS = context.techStack.languages.includes("TypeScript");
      const styleLines: string[] = [];

      if (style.variableDeclaration === "const-let") {
        styleLines.push(`- **Variable declarations**: use const/let`);
      } else if (style.variableDeclaration === "var") {
        styleLines.push(
          isTS ? `- **Variable declarations**: use const/let` : `- **Variable declarations**: use var`
        );
      }

      if (style.functionStyle === "arrow") {
        styleLines.push(`- **Function style**: arrow functions`);
      } else if (style.functionStyle === "function") {
        styleLines.push(`- **Function style**: function declarations`);
      }

      if (style.stringQuote === "single") {
        styleLines.push(`- **String quotes**: single quotes`);
      } else if (style.stringQuote === "double") {
        styleLines.push(`- **String quotes**: double quotes`);
      } else if (style.stringQuote === "backtick") {
        styleLines.push(`- **String quotes**: template strings`);
      }

      // 分号：优先从 ESLint 'semi' 规则获取，其次用启发式分析结果
      const eslintSemiRule = context.projectConfig?.eslint?.rules?.["semi"];
      let semiFromConfig: string | undefined;
      if (Array.isArray(eslintSemiRule) && eslintSemiRule.length >= 2) {
        semiFromConfig = eslintSemiRule[1] === "never" ? "never" : "always";
      } else if (eslintSemiRule === "error" || eslintSemiRule === "warn" || eslintSemiRule === 2 || eslintSemiRule === 1) {
        semiFromConfig = "always";
      }

      const effectiveSemi = semiFromConfig ?? style.semicolon;
      if (effectiveSemi === "always") {
        styleLines.push(`- **Semicolons**: use`);
      } else if (effectiveSemi === "never") {
        styleLines.push(`- **Semicolons**: omit`);
      }

      if (styleLines.length > 0) {
        rules += `### Current Project Practices (from analysis)\n\n`;
        rules += `Match the style of existing code when generating new code:\n\n`;
        rules += styleLines.join("\n") + "\n\n";
      }
    }

    // ESLint 配置说明（只描述工具存在，不重复输出命令）
    if (context.projectConfig.eslint || context.projectConfig.commands?.lint) {
      rules += `### ESLint\n\n`;
      if (context.projectConfig.eslint) {
        rules += `This project uses ESLint for code quality checks.\n\n`;
        rules += `**Config file**: @.eslintrc\n\n`;
      }
      // 命令由下方「代码生成后标准流程」统一输出，此处不重复
    }

    // 代码生成后必须运行的命令（唯一输出命令的位置）
    // 仅在存在实际命令时输出，作为对 AI 的约束，而非面向用户的交互提示
    if (context.projectConfig.commands) {
      const steps: string[] = [];
      if (context.projectConfig.commands.format) {
        steps.push(`# Format code\n${context.projectConfig.commands.format}`);
      }
      if (context.projectConfig.commands.lintFix) {
        steps.push(`# Fix lint issues\n${context.projectConfig.commands.lintFix}`);
      } else if (context.projectConfig.commands.lint) {
        steps.push(`# Run lint\n${context.projectConfig.commands.lint}`);
      }
      if (context.projectConfig.commands.typeCheck) {
        steps.push(`# Type check\n${context.projectConfig.commands.typeCheck}`);
      }

      if (steps.length > 0) {
        rules += `### Run After Code Generation\n\n`;
        rules += `\`\`\`bash\n`;
        rules += steps.join("\n\n");
        rules += `\n\`\`\`\n\n`;
      }
    }

    // 添加路径别名信息
    if (
      context.projectConfig?.pathAliases &&
      Object.keys(context.projectConfig.pathAliases).length > 0
    ) {
      rules += `### Path Aliases (required)\n\n`;
      rules += `This project defines the following path aliases; use them when generating code:\n\n`;
      for (const [alias, target] of Object.entries(
        context.projectConfig.pathAliases
      )) {
        rules += `- \`${alias}\` → \`${target}\`\n`;
      }
      rules += `\nExamples:\n`;
      rules += `\`\`\`typescript\n`;
      const firstAlias = Object.keys(context.projectConfig.pathAliases)[0];
      rules += `// ✅ Correct — use path aliases\n`;
      rules += `import { Component } from '${firstAlias}/Component';\n\n`;
      rules += `// ❌ Wrong — do not use relative paths\n`;
      rules += `import { Component } from '../../../Component';\n`;
      rules += `\`\`\`\n\n`;
    }

    return rules;
}

function generateTechSpecificConventions(context: RuleGenerationContext): string {
    const deps = context.techStack.dependencies;
    const sections: string[] = [];

    const i18nLibs = [
      { pkg: "react-intl", label: "react-intl (FormatMessage)" },
      { pkg: "i18next", label: "i18next" },
      { pkg: "react-i18next", label: "react-i18next (useTranslation)" },
      { pkg: "vue-i18n", label: "vue-i18n" },
    ];
    const foundI18n = i18nLibs.find((lib) => deps.some((d) => d.name === lib.pkg));
    if (foundI18n) {
      sections.push(`## Internationalization (i18n)\n\n` +
        `This project uses **${foundI18n.label}** for internationalization.\n` +
        `- All user-facing strings must use the i18n system — do not hardcode display text\n` +
        `- Add new translation keys to the existing locale files\n`);
    }

    const cssLibs = [
      { pkg: "stylus", label: "Stylus", ext: ".styl" },
      { pkg: "sass", label: "Sass/SCSS", ext: ".scss" },
      { pkg: "less", label: "Less", ext: ".less" },
    ];
    const foundCss = cssLibs.find((lib) => deps.some((d) => d.name === lib.pkg));
    if (foundCss) {
      sections.push(`## CSS Preprocessor\n\n` +
        `This project uses **${foundCss.label}** (\`${foundCss.ext}\` files).\n` +
        `- Write styles in \`${foundCss.ext}\` files, not plain CSS\n` +
        `- Follow existing naming conventions for CSS classes\n`);
    }

    return sections.length > 0 ? sections.join("\n") + "\n" : "";
}
