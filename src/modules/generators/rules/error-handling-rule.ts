/**
 * 错误处理规范规则生成器
 *
 * 基于项目实际错误处理实践（try-catch / Promise.catch、日志方式、自定义错误类型）
 * 生成约束。`generatePracticeBasedErrorHandling` 与 `generateErrorHandlingGuidelines`
 * 同时被 feature-recipe 的开发指南复用，故一并导出。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import type { ExtractedBestPractice } from "../best-practice-extractor.js";
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

  return `## Error Handling Guidelines

### Basic Principles
- Anticipate possible errors and handle them proactively
- Provide meaningful error messages
- Distinguish between recoverable and unrecoverable errors
- Log errors for debugging

### Quick Reference
- **Try-Catch**: For synchronous code and async/await
- **Custom Errors**: Create specific error types for precise handling
- **Error Logging**: Use appropriate log levels with contextual information
- **User Messages**: Provide friendly error messages without exposing technical details

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

  let rules = `## Project Error Handling Guidelines\n\n`;

  if (eh.type === "none" || eh.frequency === 0) {
    rules += `⚠️ The project has not yet established systematic error handling patterns. Follow these conventions.\n\n`;
  } else {
    rules += `The project primarily uses **${
      eh.type === "try-catch" ? "try-catch" : "Promise.catch()"
    }** for error handling`;
    if (eh.customErrorTypes.length > 0) {
      rules += `, with custom error types: ${eh.customErrorTypes.map((t: string) => `\`${t}\``).join(", ")}`;
    }
    rules += `.\n\n`;
  }

  rules += `### Do ✅\n\n`;
  rules += `\`\`\`${isTS ? "typescript" : "javascript"}\n`;
  rules += `// Async operations: catch, log, and surface meaningful errors to callers\n`;
  rules += `async function fetchData(id: string) {\n`;
  rules += `  try {\n`;
  rules += `    return await api.get(id);\n`;
  rules += `  } catch (err) {\n`;
  rules += `    ${logCall}('[fetchData] failed', { id, err });\n`;
  rules += `    throw err; // Let the caller decide how to present the error\n`;
  rules += `  }\n`;
  rules += `}\n`;
  rules += `\`\`\`\n\n`;

  rules += `### Don't ❌\n\n`;
  rules += `\`\`\`${isTS ? "typescript" : "javascript"}\n`;
  rules += `// Swallowing errors — causes silent failures that are hard to debug\n`;
  rules += `try { await doSomething(); } catch (_) {}\n\n`;
  rules += `// Log but don't rethrow — callers won't know the operation failed\n`;
  rules += `try { await doSomething(); } catch (err) { ${logCall}(err); }\n`;
  rules += `\`\`\`\n\n`;

  rules += `### Rules\n\n`;
  rules += `- **catch blocks must not be empty**: Must log + re-throw or handle explicitly.\n`;
  rules += `- **Logs must include context**: \`${logCall}('[scope]', { ...params, err })\`\n`;
  rules += `- **Distinguish error types**: Business errors (recoverable) vs system errors (unrecoverable); throw system errors directly.\n`;
  rules += `- **User-friendly messages**: Messages shown to users must not contain technical details; log the original error.\n`;

  // API client interceptor description
  const api = context.customPatterns?.apiClient;
  if (api?.hasErrorHandling && api.filePath) {
    rules += `\n### API Error Interceptor\n\n`;
    rules += `The project has a centralized error interceptor in \`${api.filePath}\`.\n`;
    rules += `- All API errors are handled by the interceptor — do NOT add redundant try-catch around API calls unless you need to handle specific business errors\n`;
    rules += `- Use the project's \`${api.exportName || api.name || "apiClient"}\` for all HTTP requests (see @custom-tools.mdc)\n`;
  }

  return rules;
}

/**
 * 生成错误处理规范规则文件。
 */
/**
 * 仅在项目有特有错误处理模式时生成独立文件。
 * 判断标准：有自定义错误类型 OR 使用非 console 的 logger 库 OR 有补充最佳实践。
 * 否则返回空 content（rules-generator 会跳过空 content 的规则文件）。
 */
export function generateErrorHandlingRule(
  context: RuleGenerationContext,
  missingPractices?: ExtractedBestPractice[]
): CursorRule {
  const eh = context.projectPractice?.errorHandling;
  const errorHandlingPractices =
    missingPractices?.filter((p) => p.category === "error-handling") || [];

  const hasCustomErrorTypes = (eh?.customErrorTypes?.length ?? 0) > 0;
  const hasLoggerLibrary = eh?.loggingMethod === "logger-library" && !!eh?.loggerLibrary;
  const hasSubstantialPractices = errorHandlingPractices.length >= 2;
  const hasApiClientErrorHandling = context.customPatterns?.apiClient?.hasErrorHandling === true;

  if (!hasCustomErrorTypes && !hasLoggerLibrary && !hasSubstantialPractices && !hasApiClientErrorHandling) {
    return {
      scope: "specialized",
      modulePath: context.projectPath,
      content: "",
      fileName: "error-handling.mdc",
      priority: 80,
      type: "practice",
      depends: ["global-rules", "custom-tools"],
    };
  }

  const langGlobsForErr = getLanguageGlobs(context);
  const metadata = buildRuleMetadata(
    "Error Handling Guidelines",
    "Error handling patterns, logging, and recovery strategies based on project conventions",
    80,
    context.techStack.primary,
    ["error-handling", "practice"],
    "practice",
    ["global-rules", "custom-tools"],
    { globs: langGlobsForErr }
  );

  const additionalPractices = formatMissingPractices(errorHandlingPractices);

  const content =
    metadata +
    `
# Error Handling Guidelines

See also: @global-rules.mdc, @custom-tools.mdc

${generatePracticeBasedErrorHandling(context)}

${additionalPractices ? `## Additional Best Practices\n\n${additionalPractices}\n` : ""}
*Follow the project's existing error handling patterns for consistency.*
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
