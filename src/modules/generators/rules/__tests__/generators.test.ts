/**
 * 规则生成器单元测试
 *
 * 不走 AnalysisPipeline，直接构造 RuleGenerationContext 喂给各生成器，
 * 验证核心边界：mixed 省略、空技术栈拦截、UI 库阈值裁定、persona 退化等。
 */

import { describe, it, expect } from "vitest";

import type { RuleGenerationContext, TechStack } from "../../../../types.js";
import { ValidationError } from "../../../../utils/errors.js";
import { RulesGenerator } from "../../../core/rules-generator.js";
import { generateUIUXGuidelines, generateUIUXRule } from "../ui-ux-rule.js";
import { generateGlobalOverviewRule } from "../global-rule.js";
import { generateCodeStyleRule } from "../code-style-rule.js";
import { generateArchitectureRule } from "../architecture-rule.js";
import {
  generatePersona,
  generateVersionedTechStack,
  isJsTsProject,
  hasUISignal,
  hasCustomTools,
  hasErrorHandling,
  hasStateManagement,
  detectTestFramework,
} from "../rule-helpers.js";

// ─── 工厂函数 ─────────────────────────────────────────────────

function baseTechStack(overrides?: Partial<TechStack>): TechStack {
  return {
    primary: ["React"],
    languages: ["TypeScript"],
    frameworks: ["React"],
    packageManagers: ["npm"],
    dependencies: [],
    ...overrides,
  };
}

function baseContext(
  overrides?: Partial<RuleGenerationContext>,
): RuleGenerationContext {
  return {
    projectPath: "/fake/project",
    techStack: baseTechStack(),
    modules: [],
    codeFeatures: {},
    bestPractices: [],
    includeModuleRules: false,
    ...overrides,
  };
}

// ─── 1. 空技术栈拦截（置信度闸门） ─────────────────────────────

describe("空技术栈拦截", () => {
  it("primary + languages + frameworks 全空时抛 ValidationError", async () => {
    const ctx = baseContext({
      techStack: baseTechStack({
        primary: [],
        languages: [],
        frameworks: [],
      }),
    });

    await expect(new RulesGenerator().generate(ctx, {})).rejects.toThrow(
      ValidationError,
    );
  });

  it("仅有 languages 时不抛错", async () => {
    const ctx = baseContext({
      techStack: baseTechStack({
        primary: [],
        languages: ["TypeScript"],
        frameworks: [],
      }),
    });

    const rules = await new RulesGenerator().generate(ctx, {});
    expect(rules.length).toBeGreaterThan(0);
  });
});

// ─── 2. persona 退化 ───────────────────────────────────────────

describe("generatePersona", () => {
  it("技术栈正常时包含技术名", () => {
    const result = generatePersona(baseContext());
    expect(result).toContain("React");
    expect(result).toContain("frontend");
  });

  it("primary + frameworks 空但 languages 有值时用 languages", () => {
    const ctx = baseContext({
      techStack: baseTechStack({
        primary: [],
        frameworks: [],
        languages: ["Python"],
      }),
    });
    const result = generatePersona(ctx);
    expect(result).toContain("Python");
    expect(result).not.toContain("Unknown");
  });

  it("全空时退化为通用描述，无 Unknown", () => {
    const ctx = baseContext({
      techStack: baseTechStack({
        primary: [],
        frameworks: [],
        languages: [],
      }),
    });
    const result = generatePersona(ctx);
    expect(result).toContain("software engineer");
    expect(result).not.toContain("Unknown");
  });
});

// ─── 3. generateVersionedTechStack 省略空字段 ──────────────────

describe("generateVersionedTechStack", () => {
  it("全有值时输出所有字段", () => {
    const result = generateVersionedTechStack(baseContext());
    expect(result).toContain("Primary");
    expect(result).toContain("Languages");
  });

  it("primary 空时不输出 Primary 行", () => {
    const ctx = baseContext({
      techStack: baseTechStack({ primary: [] }),
    });
    const result = generateVersionedTechStack(ctx);
    expect(result).not.toContain("Primary");
    expect(result).toContain("Languages");
  });

  it("languages 空时不输出 Languages 行", () => {
    const ctx = baseContext({
      techStack: baseTechStack({ languages: [] }),
    });
    const result = generateVersionedTechStack(ctx);
    expect(result).not.toContain("Languages");
  });
});

// ─── 4. UI/UX 规则生成（UI 库裁定阈值） ─────────────────────────

describe("UI/UX 规则生成", () => {
  describe("hasUISignal", () => {
    it("active 有库时返回 true", () => {
      const ctx = baseContext({
        uiLibraries: {
          installed: [{ name: "Ant Design", pkg: "antd", fileCount: 10 }],
          active: [{ name: "Ant Design", pkg: "antd", fileCount: 10 }],
        },
      });
      expect(hasUISignal(ctx)).toBe(true);
    });

    it("active 为空时返回 false", () => {
      const ctx = baseContext({
        uiLibraries: { installed: [], active: [] },
      });
      expect(hasUISignal(ctx)).toBe(false);
    });

    it("uiLibraries 未定义时返回 false", () => {
      const ctx = baseContext();
      expect(hasUISignal(ctx)).toBe(false);
    });

    it("已安装但未使用时返回 false", () => {
      const ctx = baseContext({
        uiLibraries: {
          installed: [{ name: "Ant Design", pkg: "antd", fileCount: 0 }],
          active: [],
        },
      });
      expect(hasUISignal(ctx)).toBe(false);
    });
  });

  describe("generateUIUXGuidelines", () => {
    it("active 含 Ant Design 时输出 antd 规范", () => {
      const ctx = baseContext({
        uiLibraries: {
          installed: [{ name: "Ant Design", pkg: "antd", fileCount: 10 }],
          active: [{ name: "Ant Design", pkg: "antd", fileCount: 10 }],
        },
      });
      const result = generateUIUXGuidelines(ctx);
      expect(result).toContain("Ant Design Conventions");
      expect(result).toContain("Form.useForm()");
    });

    it("active 含 Tailwind 时输出 Tailwind 约定", () => {
      const ctx = baseContext({
        uiLibraries: {
          installed: [
            { name: "Tailwind CSS", pkg: "tailwindcss", fileCount: 1 },
          ],
          active: [
            { name: "Tailwind CSS", pkg: "tailwindcss", fileCount: 1 },
          ],
        },
      });
      const result = generateUIUXGuidelines(ctx);
      expect(result).toContain("Tailwind Conventions");
      expect(result).not.toContain("Antd");
    });

    it("active 含 styled-components 时输出 SC 约定", () => {
      const ctx = baseContext({
        uiLibraries: {
          installed: [
            {
              name: "styled-components",
              pkg: "styled-components",
              fileCount: 5,
            },
          ],
          active: [
            {
              name: "styled-components",
              pkg: "styled-components",
              fileCount: 5,
            },
          ],
        },
      });
      const result = generateUIUXGuidelines(ctx);
      expect(result).toContain("Styled-components Conventions");
    });

    it("active 为空时输出自定义 CSS 方案", () => {
      const ctx = baseContext({
        uiLibraries: { installed: [], active: [] },
      });
      const result = generateUIUXGuidelines(ctx);
      expect(result).toContain("Custom CSS");
      expect(result).not.toContain("Antd");
      expect(result).not.toContain("Tailwind");
    });

    it("Ant Design + styled-components 同时 active 时两者都出现", () => {
      const ctx = baseContext({
        uiLibraries: {
          installed: [
            { name: "Ant Design", pkg: "antd", fileCount: 10 },
            {
              name: "styled-components",
              pkg: "styled-components",
              fileCount: 8,
            },
          ],
          active: [
            { name: "Ant Design", pkg: "antd", fileCount: 10 },
            {
              name: "styled-components",
              pkg: "styled-components",
              fileCount: 8,
            },
          ],
        },
      });
      const result = generateUIUXGuidelines(ctx);
      expect(result).toContain("antd components + styled-components");
      expect(result).toContain("Styled-components Conventions");
    });
  });

  describe("generateUIUXRule 输出结构", () => {
    it("返回正确的 fileName 和 scope", () => {
      const ctx = baseContext({
        uiLibraries: {
          installed: [{ name: "Material UI", pkg: "@mui/material", fileCount: 5 }],
          active: [{ name: "Material UI", pkg: "@mui/material", fileCount: 5 }],
        },
      });
      const rule = generateUIUXRule(ctx);
      expect(rule.fileName).toBe("ui-ux.mdc");
      expect(rule.scope).toBe("specialized");
      expect(rule.content).toContain("Material UI");
    });
  });
});

// ─── 5. code-style mixed 省略（置信度闸门） ─────────────────────

describe("code-style mixed 省略", () => {
  it("semicolon=mixed 时不输出分号行", () => {
    const ctx = baseContext({
      projectConfig: {
        pathAliases: {},
      },
      projectPractice: {
        errorHandling: { frequency: 0, patterns: [] } as never,
        codeStyle: {
          variableDeclaration: "const-let",
          functionStyle: "arrow",
          stringQuote: "single",
          semicolon: "mixed",
        } as never,
        componentPattern: {} as never,
      },
    });

    const rule = generateCodeStyleRule(ctx);

    expect(rule.content).toContain("Variable declarations");
    expect(rule.content).toContain("arrow functions");
    expect(rule.content).toContain("single quotes");
    expect(rule.content).not.toMatch(/Semicolons.*mixed/i);
  });

  it("所有风格都明确时全部输出", () => {
    const ctx = baseContext({
      projectConfig: {
        pathAliases: {},
      },
      projectPractice: {
        errorHandling: { frequency: 0, patterns: [] } as never,
        codeStyle: {
          variableDeclaration: "const-let",
          functionStyle: "arrow",
          stringQuote: "single",
          semicolon: "always",
        } as never,
        componentPattern: {} as never,
      },
    });

    const rule = generateCodeStyleRule(ctx);

    expect(rule.content).toContain("Variable declarations");
    expect(rule.content).toContain("arrow functions");
    expect(rule.content).toContain("single quotes");
    expect(rule.content).toContain("Semicolons");
  });

  it("functionStyle=mixed 时不输出函数风格行", () => {
    const ctx = baseContext({
      projectConfig: {
        pathAliases: {},
      },
      projectPractice: {
        errorHandling: { frequency: 0, patterns: [] } as never,
        codeStyle: {
          variableDeclaration: "const-let",
          functionStyle: "mixed",
          stringQuote: "single",
          semicolon: "always",
        } as never,
        componentPattern: {} as never,
      },
    });

    const rule = generateCodeStyleRule(ctx);

    expect(rule.content).toContain("Variable declarations");
    expect(rule.content).not.toMatch(/\*\*Function style\*\*/);
    expect(rule.content).toContain("single quotes");
  });
});

// ─── 6. global-rule Rule Index 动态增减 ──────────────────────────

describe("global-rule Rule Index", () => {
  it("有 testing 依赖时 Rule Index 包含 @testing.mdc", () => {
    const ctx = baseContext({
      techStack: baseTechStack({
        dependencies: [
          { name: "vitest", version: "^2.1.0", type: "devDependency" },
        ],
      }),
    });
    const rule = generateGlobalOverviewRule(ctx);
    expect(rule.content).toContain("@testing.mdc");
  });

  it("无 testing 特征时 Rule Index 不包含 @testing.mdc", () => {
    const ctx = baseContext();
    const rule = generateGlobalOverviewRule(ctx);
    expect(rule.content).not.toContain("@testing.mdc");
  });

  it("有 state-management 依赖时包含 @state-management.mdc", () => {
    const ctx = baseContext({
      techStack: baseTechStack({
        dependencies: [
          { name: "zustand", version: "^4.5.0", type: "dependency" },
        ],
      }),
    });
    const rule = generateGlobalOverviewRule(ctx);
    expect(rule.content).toContain("@state-management.mdc");
  });

  it("有 customPatterns 时包含 @custom-tools.mdc", () => {
    const ctx = baseContext({
      customPatterns: {
        customHooks: [
          { name: "useCounter", filePath: "src/hooks/useCounter.ts", hookType: "state" } as never,
        ],
        customUtils: [],
      },
    });
    const rule = generateGlobalOverviewRule(ctx);
    expect(rule.content).toContain("@custom-tools.mdc");
  });

  it("无额外特征时 Rule Index 不含动态规则行", () => {
    const ctx = baseContext();
    const rule = generateGlobalOverviewRule(ctx);
    // 提取 Rule Index 表格区域（从 "## Rule Index" 到文件末尾）
    const ruleIndex = rule.content.slice(
      rule.content.indexOf("## Rule Index"),
    );
    expect(ruleIndex).toContain("@code-style.mdc");
    expect(ruleIndex).toContain("@project-structure.mdc");
    // architecture, custom-tools, error-handling, etc. are all dynamic now
    expect(ruleIndex).not.toMatch(/\| @architecture\.mdc \|/);
    expect(ruleIndex).not.toMatch(/\| @custom-tools\.mdc \|/);
    expect(ruleIndex).not.toMatch(/\| @error-handling\.mdc \|/);
    expect(ruleIndex).not.toMatch(/\| @state-management\.mdc \|/);
    expect(ruleIndex).not.toMatch(/\| @testing\.mdc \|/);
  });
});

// ─── 7. rule-helpers 边界测试 ────────────────────────────────────

describe("rule-helpers", () => {
  describe("detectTestFramework", () => {
    it("有 vitest 依赖时返回 Vitest", () => {
      const ctx = baseContext({
        techStack: baseTechStack({
          dependencies: [
            { name: "vitest", version: "^2.1.0", type: "devDependency" },
          ],
        }),
      });
      const result = detectTestFramework(ctx);
      expect(result).toEqual({ name: "Vitest", version: "^2.1.0" });
    });

    it("无测试依赖时返回 null", () => {
      const ctx = baseContext();
      expect(detectTestFramework(ctx)).toBeNull();
    });
  });

  describe("hasCustomTools", () => {
    it("有 hooks 时返回 true", () => {
      const ctx = baseContext({
        customPatterns: {
          customHooks: [{ name: "useX" } as never],
          customUtils: [],
        },
      });
      expect(hasCustomTools(ctx)).toBe(true);
    });

    it("customPatterns 未定义时返回 false", () => {
      expect(hasCustomTools(baseContext())).toBe(false);
    });
  });

  describe("hasErrorHandling", () => {
    it("frequency > 0 时返回 true", () => {
      const ctx = baseContext({
        projectPractice: {
          errorHandling: { frequency: 3, patterns: [] } as never,
          codeStyle: {} as never,
          componentPattern: {} as never,
        },
      });
      expect(hasErrorHandling(ctx)).toBe(true);
    });

    it("frequency = 0 时返回 false", () => {
      const ctx = baseContext({
        projectPractice: {
          errorHandling: { frequency: 0, patterns: [] } as never,
          codeStyle: {} as never,
          componentPattern: {} as never,
        },
      });
      expect(hasErrorHandling(ctx)).toBe(false);
    });
  });

  describe("hasStateManagement", () => {
    it("有 zustand 依赖时返回 true", () => {
      const ctx = baseContext({
        techStack: baseTechStack({
          dependencies: [
            { name: "zustand", version: "^4.5.0", type: "dependency" },
          ],
        }),
      });
      expect(hasStateManagement(ctx)).toBe(true);
    });

    it("无状态管理依赖时返回 false", () => {
      expect(hasStateManagement(baseContext())).toBe(false);
    });
  });

  describe("generateVersionedTechStack — 版本号匹配", () => {
    it("精确匹配 react 而非 @sentry/react", () => {
      const ctx = baseContext({
        techStack: baseTechStack({
          primary: ["React"],
          frameworks: ["React"],
          dependencies: [
            { name: "@sentry/react", version: "^7.118.0", type: "dependency" },
            { name: "react", version: "^18.3.1", type: "dependency" },
          ],
        }),
      });
      const output = generateVersionedTechStack(ctx);
      expect(output).toContain("React ^18.3.1");
      expect(output).not.toContain("7.118.0");
    });

    it("无精确匹配时 fallback 到非 scoped 子串匹配", () => {
      const ctx = baseContext({
        techStack: baseTechStack({
          primary: ["Vue"],
          frameworks: ["Vue"],
          dependencies: [
            { name: "vue-router", version: "^4.0.0", type: "dependency" },
          ],
        }),
      });
      const output = generateVersionedTechStack(ctx);
      expect(output).not.toContain("Vue ^4.0.0");
    });

    it("scoped package 不参与 fallback 子串匹配", () => {
      const ctx = baseContext({
        techStack: baseTechStack({
          primary: ["Vue"],
          frameworks: ["Vue"],
          dependencies: [
            { name: "@scope/vue-plugin", version: "^1.0.0", type: "dependency" },
          ],
        }),
      });
      const output = generateVersionedTechStack(ctx);
      expect(output).not.toContain("1.0.0");
    });
  });
});

// ─── 8. 非 JS/TS 项目不含 JS/TS 专属约束 ────────────────────────

describe("非 JS/TS 项目门控", () => {
  function pythonContext(): RuleGenerationContext {
    return baseContext({
      techStack: baseTechStack({
        primary: ["Python", "Django"],
        languages: ["Python"],
        frameworks: ["Django"],
        packageManagers: ["pip"],
        dependencies: [
          { name: "django", version: "^4.2", type: "dependency" },
        ],
      }),
    });
  }

  describe("global-rule", () => {
    it("Python 项目不含 NEVER use any", () => {
      const rule = generateGlobalOverviewRule(pythonContext());
      expect(rule.content).not.toContain("NEVER use `any`");
    });

    it("TS 项目仍包含 NEVER use any", () => {
      const rule = generateGlobalOverviewRule(baseContext());
      expect(rule.content).toContain("NEVER use `any`");
    });
  });

  describe("code-style-rule", () => {
    it("Python 项目不含 TypeScript Do/Don't 代码块", () => {
      const rule = generateCodeStyleRule(pythonContext());
      expect(rule.content).not.toContain("data: any");
      expect(rule.content).not.toContain("var count = 0");
    });

    it("TS 项目仍包含 TypeScript Do/Don't 代码块", () => {
      const rule = generateCodeStyleRule(baseContext());
      expect(rule.content).toContain("data: any");
    });
  });

  describe("isJsTsProject", () => {
    it("TypeScript 项目返回 true", () => {
      expect(isJsTsProject(baseContext())).toBe(true);
    });

    it("JavaScript 项目返回 true", () => {
      const ctx = baseContext({
        techStack: baseTechStack({ languages: ["JavaScript"] }),
      });
      expect(isJsTsProject(ctx)).toBe(true);
    });

    it("纯 Python 项目返回 false", () => {
      expect(isJsTsProject(pythonContext())).toBe(false);
    });
  });
});

// ─── 平台片段注入端到端测试 ─────────────────────────────────────

describe("平台片段注入", () => {
  function flutterContext(): RuleGenerationContext {
    return baseContext({
      techStack: baseTechStack({
        primary: ["Dart"],
        languages: ["Dart"],
        frameworks: [],
        dependencies: [],
        platforms: [
          { platform: "flutter", confidence: "high", evidence: ["pubspec.yaml", ".dart"] },
        ],
      }),
    });
  }

  function rnContext(): RuleGenerationContext {
    return baseContext({
      techStack: baseTechStack({
        primary: ["React Native"],
        languages: ["TypeScript"],
        frameworks: ["React"],
        dependencies: [{ name: "react-native", version: "0.74.0", type: "dependency" as const }],
        platforms: [
          { platform: "react-native", confidence: "high", evidence: ["react-native"] },
        ],
      }),
    });
  }

  describe("Flutter 项目", () => {
    it("global-rule 包含 Flutter/Dart Constraints", () => {
      const rule = generateGlobalOverviewRule(flutterContext());
      expect(rule.content).toContain("Flutter / Dart Constraints");
      expect(rule.content).toContain("dart format");
    });

    it("code-style-rule 包含 Flutter/Dart Style", () => {
      const rule = generateCodeStyleRule(flutterContext());
      expect(rule.content).toContain("Flutter / Dart Style");
      expect(rule.content).toContain("Effective Dart");
    });

    it("architecture-rule 包含 Flutter Architecture", () => {
      const rule = generateArchitectureRule(flutterContext());
      expect(rule.content).toContain("Flutter Architecture");
      expect(rule.content).toContain("Riverpod");
    });
  });

  describe("React Native 项目", () => {
    it("global-rule 包含 React Native Constraints", () => {
      const rule = generateGlobalOverviewRule(rnContext());
      expect(rule.content).toContain("React Native Constraints");
      expect(rule.content).toContain("StyleSheet.create");
    });

    it("code-style-rule 包含 React Native Style", () => {
      const rule = generateCodeStyleRule(rnContext());
      expect(rule.content).toContain("React Native Style");
    });

    it("architecture-rule 包含 React Native Architecture", () => {
      const rule = generateArchitectureRule(rnContext());
      expect(rule.content).toContain("React Native Architecture");
      expect(rule.content).toContain("React Navigation");
    });
  });

  describe("无平台检测的项目（web 现有链路）", () => {
    it("global-rule 不包含任何平台片段标题", () => {
      const rule = generateGlobalOverviewRule(baseContext());
      expect(rule.content).not.toContain("Flutter / Dart Constraints");
      expect(rule.content).not.toContain("React Native Constraints");
      expect(rule.content).not.toContain("iOS / Swift Constraints");
      expect(rule.content).not.toContain("Android / Kotlin Constraints");
    });
  });
});
