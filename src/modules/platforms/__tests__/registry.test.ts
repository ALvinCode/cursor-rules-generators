/**
 * 平台注册表 / 能力聚合单元测试
 *
 * 验证 A 阶段「通电」：检测到的平台能正确聚合出语言/扩展名，
 * 且 web/RN 等不重复声明（交由现有依赖链路）。
 */

import { describe, it, expect } from "vitest";

import {
  getAdaptersForDetections,
  aggregatePlatformCapabilities,
  aggregatePlatformRequirements,
  aggregatePlatformRuleSections,
} from "../registry.js";
import type {
  PlatformAdapter,
  PlatformDetectContext,
  PlatformDetection,
  PlatformRuleRequirement,
  PlatformRuleSection,
} from "../types.js";

function detection(
  platform: PlatformDetection["platform"]
): PlatformDetection {
  return { platform, confidence: "high", evidence: [] };
}

describe("getAdaptersForDetections", () => {
  it("仅返回检测命中的平台 adapter", () => {
    const adapters = getAdaptersForDetections([detection("flutter")]);
    expect(adapters.map((a) => a.platform)).toEqual(["flutter"]);
  });

  it("无检测时返回空", () => {
    expect(getAdaptersForDetections([])).toEqual([]);
  });
});

describe("aggregatePlatformCapabilities", () => {
  it("Flutter → Dart / .dart", () => {
    const caps = aggregatePlatformCapabilities([detection("flutter")]);
    expect(caps.languages).toContain("Dart");
    expect(caps.fileExtensions).toContain(".dart");
  });

  it("iOS → Swift / .swift", () => {
    const caps = aggregatePlatformCapabilities([detection("ios")]);
    expect(caps.languages).toContain("Swift");
    expect(caps.fileExtensions).toContain(".swift");
  });

  it("Android → Kotlin / .kt", () => {
    const caps = aggregatePlatformCapabilities([detection("android")]);
    expect(caps.languages).toContain("Kotlin");
    expect(caps.fileExtensions).toContain(".kt");
  });

  it("web / react-native 不声明额外语言（交由现有链路）", () => {
    const caps = aggregatePlatformCapabilities([
      detection("web"),
      detection("react-native"),
    ]);
    expect(caps.languages).toEqual([]);
    expect(caps.fileExtensions).toEqual([]);
  });

  it("多平台聚合去重", () => {
    const caps = aggregatePlatformCapabilities([
      detection("flutter"),
      detection("ios"),
      detection("android"),
    ]);
    expect(caps.languages.sort()).toEqual(["Dart", "Kotlin", "Swift"]);
  });

  it("空检测返回空能力", () => {
    const caps = aggregatePlatformCapabilities([]);
    expect(caps.languages).toEqual([]);
    expect(caps.fileExtensions).toEqual([]);
  });
});

// ---------- aggregatePlatformRequirements ----------

const dummyCtx: PlatformDetectContext = {
  projectPath: "/test",
  files: [],
  dependencyNames: [],
};

function makeAdapter(
  platform: PlatformDetection["platform"],
  reqs: PlatformRuleRequirement[]
): PlatformAdapter {
  return {
    platform,
    detect: () => detection(platform),
    contributeRequirements: () => reqs,
  };
}

describe("aggregatePlatformRequirements", () => {
  it("收集 adapter 贡献的规则需求", () => {
    const adapters = [
      makeAdapter("flutter", [
        { ruleType: "code-style", ruleFileName: "code-style.mdc", priority: 90, reason: "Dart 风格", confidence: "high" },
      ]),
    ];
    const result = aggregatePlatformRequirements([detection("flutter")], dummyCtx, adapters);
    expect(result).toHaveLength(1);
    expect(result[0].ruleType).toBe("code-style");
  });

  it("同一 ruleType 保留优先级最高的", () => {
    const adapters = [
      makeAdapter("flutter", [
        { ruleType: "code-style", ruleFileName: "code-style.mdc", priority: 80, reason: "low", confidence: "medium" },
      ]),
      makeAdapter("ios", [
        { ruleType: "code-style", ruleFileName: "code-style.mdc", priority: 95, reason: "high", confidence: "high" },
      ]),
    ];
    const result = aggregatePlatformRequirements(
      [detection("flutter"), detection("ios")],
      dummyCtx,
      adapters
    );
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe(95);
    expect(result[0].reason).toBe("high");
  });

  it("adapter 无 contributeRequirements 时跳过", () => {
    const adapters: PlatformAdapter[] = [
      { platform: "web", detect: () => detection("web") },
    ];
    const result = aggregatePlatformRequirements([detection("web")], dummyCtx, adapters);
    expect(result).toEqual([]);
  });

  it("adapter 抛错不影响其他 adapter", () => {
    const adapters: PlatformAdapter[] = [
      {
        platform: "flutter",
        detect: () => detection("flutter"),
        contributeRequirements: () => { throw new Error("boom"); },
      },
      makeAdapter("ios", [
        { ruleType: "arch", ruleFileName: "architecture.mdc", priority: 85, reason: "iOS arch", confidence: "high" },
      ]),
    ];
    const result = aggregatePlatformRequirements(
      [detection("flutter"), detection("ios")],
      dummyCtx,
      adapters
    );
    expect(result).toHaveLength(1);
    expect(result[0].ruleType).toBe("arch");
  });

  it("无平台检测时返回空", () => {
    expect(aggregatePlatformRequirements([], dummyCtx)).toEqual([]);
  });
});

// ---------- aggregatePlatformRuleSections ----------

function makeAdapterWithSections(
  platform: PlatformDetection["platform"],
  sections: PlatformRuleSection[]
): PlatformAdapter {
  return {
    platform,
    detect: () => detection(platform),
    contributeRuleSections: () => sections,
  };
}

describe("aggregatePlatformRuleSections", () => {
  it("收集单个 adapter 的规则片段", () => {
    const adapters = [
      makeAdapterWithSections("flutter", [
        { ruleType: "code-style", content: "- Use `dart format`" },
      ]),
    ];
    const result = aggregatePlatformRuleSections([detection("flutter")], adapters);
    expect(result.get("code-style")).toBe("- Use `dart format`");
  });

  it("同一 ruleType 多平台片段按顺序拼接", () => {
    const adapters = [
      makeAdapterWithSections("flutter", [
        { ruleType: "global-overview", content: "## Flutter" },
      ]),
      makeAdapterWithSections("ios", [
        { ruleType: "global-overview", content: "## iOS" },
      ]),
    ];
    const result = aggregatePlatformRuleSections(
      [detection("flutter"), detection("ios")],
      adapters
    );
    expect(result.get("global-overview")).toBe("## Flutter\n## iOS");
  });

  it("adapter 无 contributeRuleSections 时跳过", () => {
    const adapters: PlatformAdapter[] = [
      { platform: "web", detect: () => detection("web") },
    ];
    const result = aggregatePlatformRuleSections([detection("web")], adapters);
    expect(result.size).toBe(0);
  });

  it("adapter 抛错不影响其他 adapter", () => {
    const adapters: PlatformAdapter[] = [
      {
        platform: "flutter",
        detect: () => detection("flutter"),
        contributeRuleSections: () => { throw new Error("boom"); },
      },
      makeAdapterWithSections("ios", [
        { ruleType: "code-style", content: "- Swift lint" },
      ]),
    ];
    const result = aggregatePlatformRuleSections(
      [detection("flutter"), detection("ios")],
      adapters
    );
    expect(result.get("code-style")).toBe("- Swift lint");
  });

  it("无检测时返回空 Map", () => {
    expect(aggregatePlatformRuleSections([]).size).toBe(0);
  });
});
