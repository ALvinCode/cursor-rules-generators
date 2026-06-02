/**
 * 测试规范规则生成器
 *
 * 仅在项目实际存在测试框架/特征或显式需求时由调用方触发（无框架则跳过，不生成空文件）。
 * `generateConditionalTestingRules` 同时被 feature-recipe 的开发指南复用，故导出。
 */

import { CursorRule, RuleGenerationContext } from "../../../types.js";
import { buildRuleMetadata } from "./rule-metadata.js";
import { featureExists, detectTestFramework } from "./rule-helpers.js";

function generateMockExample(context: RuleGenerationContext): string {
  const fw = detectTestFramework(context);
  const mockFn = fw?.name === "Vitest" ? "vi.fn" : "jest.fn";
  return `\`\`\`typescript
// ✅ Good mock usage
const mockApiClient = {
  fetchUser: ${mockFn}().mockResolvedValue({ id: 1, name: 'John' })
};

// ❌ Over-mocking
const mockEverything = ${mockFn}(() => ${mockFn}(() => ${mockFn}()));
\`\`\``;
}

/**
 * 生成测试指南（精简版）。
 */
function generateTestingGuidelines(context: RuleGenerationContext): string {
  return `## 测试规范

> 💡 **详细规范**: 完整的测试指南请参考 **@testing.mdc**

### 测试原则
- **独立性**：每个测试应该独立运行，不依赖其他测试
- **可重复性**：测试结果应该是确定的，不受运行顺序影响
- **快速执行**：单元测试应该快速完成
- **清晰性**：测试应该清楚地表达意图

### 快速参考
- **测试文件**: \`ComponentName.test.ts\` 或 \`ComponentName.spec.ts\`
- **AAA 模式**: Arrange（准备）→ Act（执行）→ Assert（验证）
- **覆盖率目标**: 核心业务逻辑达到 80%+ 覆盖率
- **优先级**:
  1. 关键业务逻辑
  2. 边界情况和错误处理
  3. 复杂的算法和数据转换
- **不需要测试**：
  - 简单的 getter/setter
  - 第三方库的功能
  - 纯 UI 布局（可以用 E2E 测试）

### Mock and Stub
- Use mocks to isolate external dependencies
- Do not over-mock; keep tests meaningful
- Create mocks for API calls, database operations, and other I/O

${generateMockExample(context)}

### 测试类型
- **单元测试**：测试单个函数或类的行为
- **集成测试**：测试多个模块的协作
- **E2E 测试**：测试完整的用户流程

### 最佳实践
- 一个测试只验证一个行为
- 使用有意义的断言消息
- 测试失败时应该清楚地指出问题所在
- 定期运行测试，不要让测试过时
- 失败的测试应该立即修复

`;
}

/**
 * 生成按需的测试规则片段（项目无测试时输出简短提示）。
 */
export function generateConditionalTestingRules(
  context: RuleGenerationContext
): string {
  const hasTests = featureExists(context, "testing");

  if (!hasTests) {
    // 项目没有测试 - 简短提示
    return `## 测试\n\n### 当前状态\n⚠️ 项目当前未配置测试框架\n\n如需添加测试，请参考相关技术栈的测试最佳实践。\n\n`;
  }

  // v1.9: 添加引用说明，避免重复基础规范
  let rules = `> 💡 **基础规范**: 测试文件命名和组织规范请参考 **@code-style.mdc**\n\n`;

  // 项目有测试 - 生成详细规则
  rules += generateTestingGuidelines(context);
  
  return rules;
}

/**
 * 生成测试规范规则文件。
 */
export function generateTestingRule(context: RuleGenerationContext): CursorRule {
  const hasTests = featureExists(context, "testing");

  const testGlobs = "**/*.{test,spec}.{ts,tsx,js,jsx}";
  const metadata = buildRuleMetadata(
    "测试规范",
    hasTests ? "Testing patterns, organization, and best practices" : "Testing recommendations for the project",
    70,
    context.techStack.primary,
    ["testing"],
    hasTests ? "practice" : "suggestion",
    ["global-rules"],
    { globs: testGlobs }
  );

  const testFramework = detectTestFramework(context);
  const testCmd = context.projectConfig?.commands?.test;
  const frameworkSection = testFramework
    ? `**Framework**: ${testFramework.name}${testFramework.version ? ` ${testFramework.version}` : ""}\n`
    : "";
  const cmdSection = testCmd ? `**Run tests**: \`${testCmd}\`\n` : "";

  const content =
    metadata +
    `
# Testing

${frameworkSection}${cmdSection}

${generateConditionalTestingRules(context)}
`;

  return {
    scope: "specialized",
    modulePath: context.projectPath,
    content,
    fileName: "testing.mdc",
    priority: 70,
    type: hasTests ? "practice" : "suggestion",
    depends: ["global-rules"],
  };
}
