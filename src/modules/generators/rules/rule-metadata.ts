/**
 * 规则 frontmatter 元数据生成
 *
 * 单一来源：所有规则文件的 YAML frontmatter（description / alwaysApply / globs）
 * 由本函数生成，供各规则生成器共享，避免 frontmatter 格式在多处漂移。
 */

/**
 * 规则激活方式：要么始终应用，要么按 globs 匹配文件时应用。
 */
export interface RuleActivation {
  alwaysApply?: boolean;
  globs?: string | string[];
}

/**
 * 生成规则文件的 frontmatter 块（含首尾 `---` 与结尾空行）。
 *
 * 注意：`title` / `priority` / `techStack` / `tags` / `type` / `depends` 当前不参与
 * frontmatter 输出，仅为保持调用点签名稳定而保留。frontmatter 只反映 description 与激活方式。
 */
export function buildRuleMetadata(
  _title: string,
  description: string,
  _priority: number,
  _techStack: string[],
  _tags: string[],
  _type?: string,
  _depends?: string[],
  activation?: RuleActivation
): string {
  let metadata = `---\ndescription: ${description}\n`;

  if (activation?.alwaysApply) {
    metadata += `alwaysApply: true\n`;
  } else if (activation?.globs) {
    metadata += `alwaysApply: false\n`;
    const globsValue = Array.isArray(activation.globs)
      ? activation.globs.join(", ")
      : activation.globs;
    metadata += `globs: ${globsValue}\n`;
  } else {
    metadata += `alwaysApply: false\n`;
  }

  metadata += `---\n\n`;
  return metadata;
}
