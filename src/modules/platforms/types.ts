/**
 * 平台（生态）抽象层 —— 类型定义
 *
 * 「平台」是决定「用什么语言、什么清单文件、什么规则模板」的适配单元。
 * 当前系统隐式假设单一平台（web）；本层引入显式的平台维度，
 * 使检测与生成可按平台分流，支持 iOS / Android / Flutter / RN / 桌面 / 多端等生态。
 *
 * 设计原则：
 * - 每个平台对应一个 PlatformAdapter（策略模式）
 * - 通用流水线负责编排，平台特定逻辑下沉到 adapter
 * - adapter 的能力按阶段渐进式补全（阶段 0 只要求 detect）
 */

/**
 * 受支持的平台标识。
 *
 * 注意：SolidJS / Qwik / Astro / React / Vue 等属于 `web` 平台下的「框架」，
 * 不是独立平台；平台维度表达的是「运行/部署目标 + 工具链」。
 */
export type Platform =
  | "web"
  | "ios"
  | "android"
  | "flutter"
  | "react-native"
  | "electron"
  | "tauri"
  | "uni-app"
  | "taro"
  | "wechat-miniprogram"
  | "kmp"
  | "ionic"
  | "nativescript";

/**
 * 单个平台的检测结果。
 */
export interface PlatformDetection {
  platform: Platform;
  /** 检测置信度：清单文件命中通常 high，仅靠扩展名/弱信号为 medium/low */
  confidence: "high" | "medium" | "low";
  /** 命中的证据（清单文件名 / 依赖名 / 文件扩展名），用于可解释性与调试 */
  evidence: string[];
}

/**
 * 平台检测所需的上下文。
 *
 * 由 tech-stack-detector 在已读取 package.json / 收集文件列表后构造，
 * 避免各 adapter 重复 I/O。
 */
export interface PlatformDetectContext {
  projectPath: string;
  /** 项目文件路径列表（相对或绝对，由调用方保证一致） */
  files: string[];
  /** 已解析的 package.json（若存在），未解析或不存在时为 undefined */
  packageJson?: Record<string, unknown>;
  /** 所有依赖名（含 dev / peer），统一小写，便于关键词匹配 */
  dependencyNames: string[];
}

/**
 * 平台能力声明。
 *
 * 用于「通电」阶段把平台带来的语言 / 扩展名叠加进 techStack。
 * 仅声明平台「额外引入」的能力；与现有依赖链路（package.json）重叠的部分
 * （如 React Native 的 JS/TS）无需在此重复声明，交由现有链路处理。
 */
export interface PlatformCapabilities {
  /** 平台引入的编程语言（如 Flutter→["Dart"]、iOS→["Swift"]、Android→["Kotlin"]） */
  languages?: string[];
  /** 平台专属文件扩展名，含点（如 [".dart"]、[".swift"]、[".kt"]） */
  fileExtensions?: string[];
}

/**
 * 平台贡献的规则需求（与 RuleRequirement 结构对齐，但来源为平台 adapter）。
 */
export interface PlatformRuleRequirement {
  ruleType: string;
  ruleFileName: string;
  priority: number;
  reason: string;
  confidence: "high" | "medium" | "low";
}

/**
 * 平台向规则生成器注入的内容片段。
 *
 * 每条记录绑定到一个 ruleType（与 RuleRequirement.ruleType 一致），
 * 聚合时同 ruleType 的片段按平台顺序拼接。
 */
export interface PlatformRuleSection {
  /** 目标规则类型，如 "global-overview" / "code-style" / "architecture" */
  ruleType: string;
  /** 要追加的 markdown 内容片段（不含 frontmatter，仅正文） */
  content: string;
}

/**
 * 平台适配器接口。
 *
 * 阶段 0 只要求实现 `detect`；后续阶段渐进式扩展（能力声明、清单解析、
 * 规则需求贡献、规则模板片段等），均以可选成员加入，保持向后兼容。
 */
export interface PlatformAdapter {
  readonly platform: Platform;
  /**
   * 基于清单文件 / 依赖 / 文件特征判定该平台是否存在。
   * 命中返回检测结果，未命中返回 null。
   */
  detect(ctx: PlatformDetectContext): PlatformDetection | null;
  /**
   * 声明平台引入的语言 / 扩展名等能力（通电阶段叠加进 techStack）。
   * 可选：仅当平台引入了现有链路无法覆盖的语言时实现。
   */
  getCapabilities?(): PlatformCapabilities;
  /**
   * 贡献该平台应触发的规则需求（路由 / 状态 / UI 等）。
   * 可选：仅当平台有独立于 web 依赖链路的规则触发逻辑时实现。
   * 返回的需求将与 web 链路产生的需求合并（去重取高优先级）。
   */
  contributeRequirements?(ctx: PlatformDetectContext): PlatformRuleRequirement[];
  /**
   * 贡献该平台应注入到各规则文件的内容片段。
   * 可选：仅当平台需要向生成的规则文件追加特定约束 / 原则时实现。
   */
  contributeRuleSections?(): PlatformRuleSection[];
}
