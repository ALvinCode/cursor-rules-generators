/**
 * 平台注册表 + 能力聚合（A 阶段「通电」）
 *
 * 提供从「检测结果」到「适配器」的映射，以及跨平台能力聚合 helper。
 * 通过本层，流水线可把各平台 adapter 声明的语言/扩展名等能力叠加进 techStack，
 * 而无需在调用方硬编码平台判断。
 */

import { CORE_PLATFORM_ADAPTERS } from "./detector.js";
import {
  PlatformAdapter,
  PlatformDetectContext,
  PlatformDetection,
  PlatformRuleRequirement,
  PlatformRuleSection,
} from "./types.js";

/**
 * 根据检测结果筛选出对应的已注册适配器。
 */
export function getAdaptersForDetections(
  detections: PlatformDetection[],
  adapters: PlatformAdapter[] = CORE_PLATFORM_ADAPTERS
): PlatformAdapter[] {
  const detected = new Set(detections.map((d) => d.platform));
  return adapters.filter((a) => detected.has(a.platform));
}

/**
 * 聚合检测到的平台所声明的语言与文件扩展名（去重）。
 *
 * 仅返回平台「额外引入」的能力；不含 web/RN 等已由现有依赖链路覆盖的语言。
 */
export function aggregatePlatformCapabilities(
  detections: PlatformDetection[],
  adapters: PlatformAdapter[] = CORE_PLATFORM_ADAPTERS
): { languages: string[]; fileExtensions: string[] } {
  const languages = new Set<string>();
  const fileExtensions = new Set<string>();

  for (const adapter of getAdaptersForDetections(detections, adapters)) {
    const caps = adapter.getCapabilities?.();
    caps?.languages?.forEach((l) => languages.add(l));
    caps?.fileExtensions?.forEach((e) => fileExtensions.add(e));
  }

  return {
    languages: [...languages],
    fileExtensions: [...fileExtensions],
  };
}

/**
 * 聚合检测到的平台所贡献的规则需求。
 *
 * 同一 ruleType 多个平台贡献时，保留优先级最高的一条。
 * 单个 adapter 抛错不影响整体聚合。
 */
export function aggregatePlatformRequirements(
  detections: PlatformDetection[],
  detectCtx: PlatformDetectContext,
  adapters: PlatformAdapter[] = CORE_PLATFORM_ADAPTERS
): PlatformRuleRequirement[] {
  const byType = new Map<string, PlatformRuleRequirement>();

  for (const adapter of getAdaptersForDetections(detections, adapters)) {
    try {
      const reqs = adapter.contributeRequirements?.(detectCtx) ?? [];
      for (const req of reqs) {
        const existing = byType.get(req.ruleType);
        if (!existing || req.priority > existing.priority) {
          byType.set(req.ruleType, req);
        }
      }
    } catch {
      // 单个 adapter 失败不影响整体
    }
  }

  return [...byType.values()];
}

/**
 * 聚合检测到的平台贡献的规则内容片段，按 ruleType 分组。
 *
 * 同一 ruleType 多个平台都有片段时，按 adapter 注册顺序拼接。
 * 返回 Map<ruleType, 拼接后的 markdown 内容>。
 */
export function aggregatePlatformRuleSections(
  detections: PlatformDetection[],
  adapters: PlatformAdapter[] = CORE_PLATFORM_ADAPTERS
): Map<string, string> {
  const sections = new Map<string, string[]>();

  for (const adapter of getAdaptersForDetections(detections, adapters)) {
    try {
      const contributed = adapter.contributeRuleSections?.() ?? [];
      for (const s of contributed) {
        const existing = sections.get(s.ruleType) ?? [];
        existing.push(s.content);
        sections.set(s.ruleType, existing);
      }
    } catch {
      // 单个 adapter 失败不影响整体
    }
  }

  const result = new Map<string, string>();
  for (const [ruleType, parts] of sections) {
    result.set(ruleType, parts.join("\n"));
  }
  return result;
}
