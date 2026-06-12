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
  return `## Testing Conventions

> 💡 **Full guidelines**: See **@testing.mdc** for the complete testing guide

### Testing Principles
- **Independence**: Each test should run independently without relying on other tests
- **Repeatability**: Results should be deterministic regardless of run order
- **Fast execution**: Unit tests should complete quickly
- **Clarity**: Tests should clearly express intent

### Quick Reference
- **Test files**: \`ComponentName.test.ts\` or \`ComponentName.spec.ts\`
- **AAA pattern**: Arrange → Act → Assert
- **Coverage target**: 80%+ coverage for core business logic
- **Priority**:
  1. Critical business logic
  2. Edge cases and error handling
  3. Complex algorithms and data transformations
- **Skip testing**:
  - Simple getters/setters
  - Third-party library behavior
  - Pure UI layout (use E2E tests instead)

### Mock and Stub
- Use mocks to isolate external dependencies
- Do not over-mock; keep tests meaningful
- Create mocks for API calls, database operations, and other I/O

${generateMockExample(context)}

### Test Types
- **Unit tests**: Test individual functions or classes
- **Integration tests**: Test collaboration across modules
- **E2E tests**: Test complete user flows

### Best Practices
- One test should verify one behavior
- Use meaningful assertion messages
- Failures should clearly indicate what went wrong
- Run tests regularly; don't let them go stale
- Fix failing tests immediately

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
    let section = `## Verification\n\n`;
    const cmds = context.projectConfig?.commands;
    const cmdLines: string[] = [];
    if (cmds?.lint) cmdLines.push(`| Lint | \`${cmds.lint}\` |`);
    if (cmds?.lintFix) cmdLines.push(`| Lint Fix | \`${cmds.lintFix}\` |`);
    if (cmds?.format) cmdLines.push(`| Format | \`${cmds.format}\` |`);
    if (cmds?.typeCheck) cmdLines.push(`| Type Check | \`${cmds.typeCheck}\` |`);
    if (cmds?.test) cmdLines.push(`| Test | \`${cmds.test}\` |`);
    if (cmdLines.length > 0) {
      section += `| Task | Command |\n|------|---------|
${cmdLines.join("\n")}\n\n`;
      section += `Run these commands after code changes to verify correctness.\n\n`;
    }
    section += `> ⚠️ No test framework configured. When adding tests, follow the project's tech stack conventions.\n\n`;
    return section;
  }

  // v1.9: 添加引用说明，避免重复基础规范
  let rules = `> 💡 **Base conventions**: See **@code-style.mdc** for test file naming and organization\n\n`;

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
    "Testing Conventions",
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
  const infoLines: string[] = [];
  if (testFramework) {
    infoLines.push(`**Framework**: ${testFramework.name}${testFramework.version ? ` ${testFramework.version}` : ""}`);
  }
  if (testCmd) {
    infoLines.push(`**Run tests**: \`${testCmd}\``);
  }
  const infoBlock = infoLines.length > 0 ? `${infoLines.join("\n")}\n` : "";

  const content =
    metadata +
    `
# Testing

${infoBlock}${generateConditionalTestingRules(context)}
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
