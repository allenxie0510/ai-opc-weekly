export type WeeklyItemRank = {
  id: string;
  rank: number;
};

/**
 * 删除周报条目后重新生成连续 rank，避免后续自动补足时出现重复排名。
 */
export function buildWeeklyRankUpdates(items: WeeklyItemRank[]) {
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  return sorted.flatMap((item, index) => {
    const rank = index + 1;
    return item.rank === rank ? [] : [{ id: item.id, rank }];
  });
}

/** 只修正生成器创建的标准摘要；管理员自定义摘要保持原样。 */
export function updateGeneratedWeeklySummaryCount(summary: string | null, itemCount: number) {
  if (!summary) return summary;
  return summary.replace(/^本周\s+\d+\s+个深度拆解：/, `本周 ${itemCount} 个深度拆解：`);
}
