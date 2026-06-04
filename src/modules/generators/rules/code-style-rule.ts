/**
 * 代码风格规则生成器
 *
 * 基于项目配置（Prettier/ESLint）或分析出的实践生成代码风格约定。
 * `generateCodeStyleGuidelines` 同时被 module 生成器复用，故导出。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import { getLanguageGlobs, formatMissingPractices } from "./rule-helpers.js";

/**
 * v1.3: 生成代码风格规则（约 200 行）
 * v1.5: 补充缺失的最佳实践
 */
export function generateCodeStyleRule(
  context: RuleGenerationContext,
  missingPractices?: any[]
): CursorRule {
    const langGlobs = getLanguageGlobs(context);
    const metadata = buildRuleMetadata(
      "代码风格规范",
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

    const content =
      metadata +
      `
# Code Style

${
  context.projectConfig
    ? generateConfigBasedStyleRules(context)
    : generateCodeStyleGuidelines(context)
}

## Do / Don't

\`\`\`typescript
// DON'T: use any — 失去类型保护
function process(data: any) { return data.value; }

// DO: 使用精确类型
function process(data: ProcessInput): ProcessOutput {
  return data.value;
}
\`\`\`

\`\`\`typescript
// DON'T: 隐式类型 + 可变默认
var count = 0;

// DO: 显式类型 + 不可变优先
const count: number = 0;
\`\`\`

> 错误处理规范请参考 **@error-handling.mdc**

${additionalPractices ? `## Additional Best Practices\n\n${additionalPractices}\n` : ""}
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
    let style = `## 通用规范

- 使用有意义的变量和函数名
- 保持函数简短，单一职责
- 添加必要的注释，解释"为什么"而非"是什么"
- 保持代码格式一致

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

    return `## JavaScript/TypeScript 代码风格

### 基本规范
- 使用 \`const\` 和 \`let\`，避免 \`var\`
- 优先使用箭头函数
- 使用模板字符串而非字符串拼接
- 使用解构赋值简化代码
- 使用 async/await 处理异步操作

### 格式化规则
- **字符串**：优先使用单引号 \`'string'\`，除非需要插值则使用反引号 \`\\\`template\\\`\`
- **分号**：保持一致（推荐使用分号）
- **行长度**：限制每行最多 100 个字符
- **缩进**：使用 2 个空格（或根据项目配置）
- **尾随逗号**：多行对象/数组最后一项添加逗号

### 代码组织
- **导入顺序**：
  1. 外部库导入
  2. 内部模块导入
  3. 相对路径导入
  ${isTypeScript ? "4. 类型导入（使用 `import type`）" : ""}
- **导出**：优先使用命名导出，避免默认导出（提高可维护性）

${
  isTypeScript
    ? `### TypeScript 特定规范
- 优先使用 \`interface\` 定义对象类型
- 使用 \`type\` 定义联合类型和工具类型
- 避免使用 \`any\`，使用 \`unknown\` 代替
- 为函数参数和返回值显式添加类型
- 使用严格模式（\`strict: true\`）
- 使用类型守卫而非类型断言
`
    : ""
}
`;
}

/**
 * 生成 Python 风格指南
 */
function generatePythonStyleGuide(): string {
    return `## Python 代码风格

### PEP 8 规范
- **缩进**：使用 4 个空格
- **行长度**：限制每行最多 79 个字符（文档字符串/注释 72 个字符）
- **空行**：
  - 顶级函数和类定义之间空 2 行
  - 类内方法之间空 1 行
- **字符串引号**：保持一致（推荐单引号）

### 命名规范
- **函数/变量**：snake_case (例如：\`get_user_data\`)
- **类名**：PascalCase (例如：\`UserProfile\`)
- **常量**：UPPER_CASE (例如：\`MAX_RETRY_COUNT\`)
- **私有属性**：单下划线前缀 (例如：\`_internal_method\`)
- **特殊方法**：双下划线前后 (例如：\`__init__\`)

### 导入规范
- **导入顺序**：
  1. 标准库导入
  2. 第三方库导入
  3. 本地应用/库导入
- 每组之间空一行
- 避免通配符导入 (\`from module import *\`)

### 类型注解
- 为函数参数添加类型注解
- 为函数返回值添加类型注解
- 使用 \`typing\` 模块的类型（List, Dict, Optional 等）
- 使用 \`mypy\` 进行静态类型检查

`;
}

/**
 * 生成格式化规则
 */
function generateFormattingRules(context: RuleGenerationContext): string {
    return `## 代码格式化

### 空格和缩进
- 运算符两侧添加空格：\`a + b\` 而非 \`a+b\`
- 逗号后添加空格：\`[1, 2, 3]\` 而非 \`[1,2,3]\`
- 关键字后添加空格：\`if (condition)\` 而非 \`if(condition)\`
- 不要在括号内侧添加空格：\`func(a, b)\` 而非 \`func( a, b )\`

### 代码块
- 始终使用花括号，即使只有一行代码
- \`else\` 语句与关闭花括号在同一行（JavaScript/TypeScript）
- 花括号的左括号不换行（K&R 风格）

### 注释规范
- 单行注释使用 \`//\`（JavaScript/TypeScript）或 \`#\`（Python）
- 多行注释使用 \`/* */\`（JavaScript/TypeScript）或 \`"""\`（Python）
- 注释应该解释"为什么"而不是"是什么"
- 保持注释与代码同步更新

`;
}

/**
 * 生成命名约定
 */
function generateNamingConventions(context: RuleGenerationContext): string {
    return `## 命名约定

### 通用规则
- **组件/类/接口**：PascalCase
  - 示例：\`UserProfile\`, \`DataService\`, \`IUserRepository\`
- **变量/函数/方法**：camelCase
  - 示例：\`userName\`, \`getUserData()\`, \`handleClick()\`
- **常量**：UPPER_CASE
  - 示例：\`MAX_RETRY_COUNT\`, \`API_BASE_URL\`, \`DEFAULT_TIMEOUT\`
- **私有属性**：前缀 \`_\`（约定）或使用 \`#\`（JavaScript 私有字段）
  - 示例：\`_privateMethod\`, \`#privateField\`

### 文件命名
${generateFileNamingRules(context)}

### 特定场景
- **布尔变量**：使用 \`is\`、\`has\`、\`should\` 前缀
  - 示例：\`isActive\`, \`hasPermission\`, \`shouldUpdate\`
- **事件处理器**：使用 \`handle\` 或 \`on\` 前缀
  - 示例：\`handleClick\`, \`onSubmit\`, \`handleUserLogin\`
- **获取器/设置器**：使用 \`get\`/\`set\` 前缀
  - 示例：\`getUser\`, \`setUser\`, \`getUserName\`

### 避免的命名
- ❌ 单字母变量（除了循环计数器 \`i\`, \`j\`, \`k\`）
- ❌ 缩写和简写（除非是广为人知的，如 \`URL\`, \`HTTP\`）
- ❌ 匈牙利命名法（如 \`strName\`, \`intCount\`）
- ❌ 无意义的名称（如 \`data\`, \`temp\`, \`foo\`, \`bar\`）

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
      rules += `- **React 组件**：PascalCase.tsx/jsx
  - 示例：\`UserProfile.tsx\`, \`Button.tsx\`
`;
    }

    if (hasVue) {
      rules += `- **Vue 组件**：PascalCase.vue 或 kebab-case.vue
  - 示例：\`UserProfile.vue\` 或 \`user-profile.vue\`
`;
    }

    rules += `- **工具/辅助文件**：camelCase 或 kebab-case
  - 示例：\`formatDate.ts\`, \`api-client.ts\`
- **类型定义文件**：types.ts 或 interfaces.ts
- **测试文件**：与源文件同名 + \`.test\` 或 \`.spec\`
  - 示例：\`UserProfile.test.tsx\`, \`utils.spec.ts\`
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

    let rules = `## 代码风格（基于项目配置）\n\n`;

    // 使用项目实际配置
    if (context.projectConfig.prettier) {
      const p = context.projectConfig.prettier;
      rules += `### 项目配置 (Prettier)\n\n`;
      rules += `项目使用 Prettier 进行代码格式化，配置如下：\n\n`;
      rules += `- **缩进**: ${
        p.useTabs ? "Tab" : `${p.tabWidth || 2} 个空格`
      }\n`;
      rules += `- **引号**: ${p.singleQuote ? "单引号" : "双引号"}\n`;
      rules += `- **分号**: ${p.semi ? "使用分号" : "不使用分号"}\n`;
      rules += `- **行长度**: ${p.printWidth || 80} 字符\n`;
      rules += `- **尾随逗号**: ${p.trailingComma || "none"}\n\n`;
      rules += `**配置文件**: @.prettierrc\n\n`;

      rules += `### 代码格式化要求\n\n`;
      rules += `生成代码时遵循上述 Prettier 配置：\n`;
      rules += `- 使用${p.singleQuote ? "单引号" : "双引号"}包裹字符串\n`;
      rules += `- 使用 ${
        p.useTabs ? "Tab" : `${p.tabWidth || 2} 个空格`
      }缩进\n`;
      rules += `- ${p.semi ? "添加" : "不添加"}分号\n\n`;
    } else if (context.projectPractice?.codeStyle) {
      // 使用分析出的代码风格：仅输出能明确判定的项，"mixed"/不确定的项一律省略，
      // 避免产出对 AI 无指导价值的「混合」占位内容（置信度闸门）
      const style = context.projectPractice.codeStyle;
      const isTS = context.techStack.languages.includes("TypeScript");
      const styleLines: string[] = [];

      // TypeScript/modern JS 项目不可能以 var 为主，若检测为 var 优先纠正为 const/let
      if (style.variableDeclaration === "const-let") {
        styleLines.push(`- **变量声明**: 使用 const/let`);
      } else if (style.variableDeclaration === "var") {
        styleLines.push(
          isTS ? `- **变量声明**: 使用 const/let` : `- **变量声明**: 使用 var`
        );
      }

      if (style.functionStyle === "arrow") {
        styleLines.push(`- **函数风格**: 箭头函数`);
      } else if (style.functionStyle === "function") {
        styleLines.push(`- **函数风格**: function 声明`);
      }

      if (style.stringQuote === "single") {
        styleLines.push(`- **字符串引号**: 单引号`);
      } else if (style.stringQuote === "double") {
        styleLines.push(`- **字符串引号**: 双引号`);
      } else if (style.stringQuote === "backtick") {
        styleLines.push(`- **字符串引号**: 模板字符串`);
      }

      if (style.semicolon === "always") {
        styleLines.push(`- **分号**: 使用`);
      } else if (style.semicolon === "never") {
        styleLines.push(`- **分号**: 不使用`);
      }

      if (styleLines.length > 0) {
        rules += `### 项目当前实践（分析得出）\n\n`;
        rules += `生成代码时保持与现有代码一致的风格：\n\n`;
        rules += styleLines.join("\n") + "\n\n";
      }
    }

    // ESLint 配置说明（只描述工具存在，不重复输出命令）
    if (context.projectConfig.eslint || context.projectConfig.commands?.lint) {
      rules += `### ESLint 代码检查\n\n`;
      if (context.projectConfig.eslint) {
        rules += `项目使用 ESLint 进行代码质量检查。\n\n`;
        rules += `**配置文件**: @.eslintrc\n\n`;
      }
      // 命令由下方「代码生成后标准流程」统一输出，此处不重复
    }

    // 代码生成后必须运行的命令（唯一输出命令的位置）
    // 仅在存在实际命令时输出，作为对 AI 的约束，而非面向用户的交互提示
    if (context.projectConfig.commands) {
      const steps: string[] = [];
      if (context.projectConfig.commands.format) {
        steps.push(`# 格式化代码\n${context.projectConfig.commands.format}`);
      }
      if (context.projectConfig.commands.lintFix) {
        steps.push(`# 修复 lint 问题\n${context.projectConfig.commands.lintFix}`);
      } else if (context.projectConfig.commands.lint) {
        steps.push(`# 检查 lint\n${context.projectConfig.commands.lint}`);
      }
      if (context.projectConfig.commands.typeCheck) {
        steps.push(`# 类型检查\n${context.projectConfig.commands.typeCheck}`);
      }

      if (steps.length > 0) {
        rules += `### 代码生成后必须运行\n\n`;
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
      rules += `### 路径别名（必须使用）\n\n`;
      rules += `项目配置了以下路径别名，生成代码时必须使用：\n\n`;
      for (const [alias, target] of Object.entries(
        context.projectConfig.pathAliases
      )) {
        rules += `- \`${alias}\` → \`${target}\`\n`;
      }
      rules += `\n示例：\n`;
      rules += `\`\`\`typescript\n`;
      const firstAlias = Object.keys(context.projectConfig.pathAliases)[0];
      rules += `// ✅ 正确 - 使用路径别名\n`;
      rules += `import { Component } from '${firstAlias}/Component';\n\n`;
      rules += `// ❌ 错误 - 不要使用相对路径\n`;
      rules += `import { Component } from '../../../Component';\n`;
      rules += `\`\`\`\n\n`;
    }

    return rules;
}
