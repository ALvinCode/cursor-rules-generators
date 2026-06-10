/**
 * 规则需求分析器单元测试
 *
 * 验证 Web 框架补全（L2）：新增前端路由库 / 状态库能正确触发对应规则需求，
 * 同时不破坏既有框架（react-router / redux）的触发行为。
 */

import { describe, it, expect } from "vitest";

import type {
  RuleGenerationContext,
  TechStack,
  Dependency,
} from "../../../types.js";
import { RuleRequirementsAnalyzer } from "../rule-requirements-analyzer.js";

function deps(...names: string[]): Dependency[] {
  return names.map((name) => ({
    name,
    version: "^1.0.0",
    type: "dependency" as const,
  }));
}

function techStack(overrides?: Partial<TechStack>): TechStack {
  return {
    primary: ["React"],
    languages: ["TypeScript"],
    frameworks: ["React"],
    packageManagers: ["npm"],
    dependencies: [],
    ...overrides,
  };
}

function context(overrides?: Partial<RuleGenerationContext>): RuleGenerationContext {
  return {
    projectPath: "/fake/project",
    techStack: techStack(),
    modules: [],
    codeFeatures: {},
    bestPractices: [],
    includeModuleRules: false,
    ...overrides,
  };
}

function ruleTypes(ctx: RuleGenerationContext): string[] {
  return new RuleRequirementsAnalyzer()
    .analyzeRequirements(ctx)
    .map((r) => r.ruleType);
}

describe("RuleRequirementsAnalyzer — Web 框架路由触发", () => {
  it("SolidJS + @solidjs/router 触发前端路由规则", () => {
    const ctx = context({
      techStack: techStack({ dependencies: deps("solid-js", "@solidjs/router") }),
    });
    expect(ruleTypes(ctx)).toContain("frontend-routing");
  });

  it("@tanstack/router 触发前端路由规则", () => {
    const ctx = context({
      techStack: techStack({ dependencies: deps("@tanstack/router") }),
    });
    expect(ruleTypes(ctx)).toContain("frontend-routing");
  });

  it("@tanstack/react-router 触发前端路由规则（被 react-router 子串覆盖）", () => {
    const ctx = context({
      techStack: techStack({ dependencies: deps("@tanstack/react-router") }),
    });
    expect(ruleTypes(ctx)).toContain("frontend-routing");
  });

  it("Qwik City 触发前端路由规则", () => {
    const ctx = context({
      techStack: techStack({
        dependencies: deps("@builder.io/qwik", "@builder.io/qwik-city"),
      }),
    });
    expect(ruleTypes(ctx)).toContain("frontend-routing");
  });

  it("回归：react-router 仍触发前端路由规则", () => {
    const ctx = context({
      techStack: techStack({ dependencies: deps("react-router-dom") }),
    });
    expect(ruleTypes(ctx)).toContain("frontend-routing");
  });

  it("无路由依赖时不触发前端路由规则", () => {
    const ctx = context({
      techStack: techStack({ dependencies: deps("lodash") }),
    });
    expect(ruleTypes(ctx)).not.toContain("frontend-routing");
  });
});

describe("RuleRequirementsAnalyzer — 状态管理触发", () => {
  it("nanostores 触发状态管理规则", () => {
    const ctx = context({
      techStack: techStack({ dependencies: deps("nanostores") }),
    });
    expect(ruleTypes(ctx)).toContain("state-management");
  });

  it("回归：redux 仍触发状态管理规则", () => {
    const ctx = context({
      techStack: techStack({ dependencies: deps("@reduxjs/toolkit") }),
    });
    expect(ruleTypes(ctx)).toContain("state-management");
  });

  it("无状态库时不触发状态管理规则", () => {
    const ctx = context({
      techStack: techStack({ dependencies: deps("lodash") }),
    });
    expect(ruleTypes(ctx)).not.toContain("state-management");
  });
});

describe("RuleRequirementsAnalyzer — 基础规则恒定生成", () => {
  it("始终包含 global / code-style / architecture", () => {
    const types = ruleTypes(context());
    expect(types).toContain("global-overview");
    expect(types).toContain("code-style");
    expect(types).toContain("architecture");
  });
});
