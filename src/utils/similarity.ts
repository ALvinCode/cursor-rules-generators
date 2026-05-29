/**
 * 集合相似度算法。
 *
 * 项目中的多个匹配器（framework-matcher, tech-stack-matcher）原本各自维护
 * 相同的 Jaccard 实现，导致一旦优化算法（例如加权或大小写处理）就需要
 * 修改两处。本工具是唯一来源。
 */

/**
 * Jaccard 相似度：|A ∩ B| / |A ∪ B|。
 *
 * 输入字符串将转为小写比较以避免大小写漂移；空集 vs 空集返回 0
 * （避免 0/0 = NaN）。
 *
 * @param a 集合 A
 * @param b 集合 B
 * @returns [0, 1] 之间的相似度
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
