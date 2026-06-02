/**
 * 错误处理规范规则生成器
 *
 * 基于项目实际错误处理实践（try-catch / Promise.catch、日志方式、自定义错误类型）
 * 生成约束。`generatePracticeBasedErrorHandling` 与 `generateErrorHandlingGuidelines`
 * 同时被 feature-recipe 的开发指南复用，故一并导出。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import { getLanguageGlobs, formatMissingPractices } from "./rule-helpers.js";

/**
 * 错误处理指南（精简版，作为缺省/复用片段）。
 */
export function generateErrorHandlingGuidelines(
  context: RuleGenerationContext
): string {
  const isJavaScript =
    context.techStack.languages.includes("JavaScript") ||
    context.techStack.languages.includes("TypeScript");
  const isPython = context.techStack.languages.includes("Python");

  // v1.9: 精简版，避免与 error-handling.mdc 重复
  return `## 错误处理规范

> 💡 **详细规范**: 完整的错误处理指南请参考 **@error-handling.mdc**

### 基本原则
- 预测可能的错误并主动处理
- 提供有意义的错误信息
- 区分可恢复和不可恢复的错误
- 记录错误以便调试

### 快速参考
- **Try-Catch**: 用于同步代码和 async/await
- **自定义错误**: 创建特定的错误类型以便精确处理
- **错误日志**: 使用适当的日志级别，包含上下文信息
- **用户消息**: 提供友好的错误提示，不暴露技术细节

`;
}

/**
 * 基于项目实践生成错误处理规范片段（无实践数据时回退到通用指南）。
 */
export function generatePracticeBasedErrorHandling(
  context: RuleGenerationContext
): string {
  if (!context.projectPractice?.errorHandling) {
    return generateErrorHandlingGuidelines(context);
  }

  const eh = context.projectPractice.errorHandling;
  const isTS = context.techStack.languages.includes("TypeScript");
  const logMethod = eh.loggingMethod === "logger-library" && eh.loggerLibrary
    ? eh.loggerLibrary
    : "console";
  const logCall = logMethod === "console" ? "console.error" : `${logMethod}.error`;

  let rules = `## 项目错误处理规范\n\n`;

  if (eh.type === "none" || eh.frequency === 0) {
    rules += `⚠️ 项目尚未建立系统的错误处理模式，请遵循以下约定。\n\n`;
  } else {
    rules += `项目主要使用 **${
      eh.type === "try-catch" ? "try-catch" : "Promise.catch()"
    }** 处理错误`;
    if (eh.customErrorTypes.length > 0) {
      rules += `，自定义错误类型：${eh.customErrorTypes.map((t: string) => `\`${t}\``).join("、")}`;
    }
    rules += `。\n\n`;
  }

  rules += `### Do ✅\n\n`;
  rules += `\`\`\`${isTS ? "typescript" : "javascript"}\n`;
  rules += `// 异步操作：捕获并记录，向上层暴露有意义的错误\n`;
  rules += `async function fetchData(id: string) {\n`;
  rules += `  try {\n`;
  rules += `    return await api.get(id);\n`;
  rules += `  } catch (err) {\n`;
  rules += `    ${logCall}('[fetchData] failed', { id, err });\n`;
  rules += `    throw err; // 让调用方决定如何展示\n`;
  rules += `  }\n`;
  rules += `}\n`;
  rules += `\`\`\`\n\n`;

  rules += `### Don't ❌\n\n`;
  rules += `\`\`\`${isTS ? "typescript" : "javascript"}\n`;
  rules += `// 吞掉错误 — 导致静默失败，难以排查\n`;
  rules += `try { await doSomething(); } catch (_) {}\n\n`;
  rules += `// 记录但不抛出 — 上层不知道操作失败\n`;
  rules += `try { await doSomething(); } catch (err) { ${logCall}(err); }\n`;
  rules += `\`\`\`\n\n`;

  rules += `### 规则\n\n`;
  rules += `- **catch 块不能为空**：必须 log + re-throw 或显式处理。\n`;
  rules += `- **日志包含上下文**：\`${logCall}('[scope]', { ...params, err })\`\n`;
  rules += `- **区分错误类型**：业务错误（可恢复）vs 系统错误（不可恢复），后者直接 throw。\n`;
  rules += `- **用户提示友好**：展示给用户的消息不含技术细节，记录原始错误到日志。\n`;

  return rules;
}

/**
 * 生成错误处理规范规则文件。
 */
export function generateErrorHandlingRule(
  context: RuleGenerationContext,
  missingPractices?: any[]
): CursorRule {
  const langGlobsForErr = getLanguageGlobs(context);
  const metadata = buildRuleMetadata(
    "错误处理规范",
    "Error handling patterns, logging, and recovery strategies based on project conventions",
    80,
    context.techStack.primary,
    ["error-handling", "practice"],
    "practice",
    ["global-rules", "custom-tools"],
    { globs: langGlobsForErr }
  );

  // 补充缺失的最佳实践
  const errorHandlingPractices =
    missingPractices?.filter((p) => p.category === "error-handling") || [];
  const additionalPractices = formatMissingPractices(errorHandlingPractices);

  const content =
    metadata +
    `
# 错误处理规范

参考: @global-rules.mdc, @custom-tools.mdc

${generatePracticeBasedErrorHandling(context)}

${additionalPractices ? `\n## 补充的最佳实践\n\n${additionalPractices}\n` : ""}

---

*遵循项目现有的错误处理模式，保持一致性。*
`;

  return {
    scope: "specialized",
    modulePath: context.projectPath,
    content,
    fileName: "error-handling.mdc",
    priority: 80,
    type: "practice",
    depends: ["global-rules", "custom-tools"],
  };
}
