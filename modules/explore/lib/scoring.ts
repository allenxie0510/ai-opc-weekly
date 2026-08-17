import type { Criterion, Opportunity, RankedOpportunity } from './types';
import { CRITERIA, totalWeight } from './criteria';

/** 取某机会在某个维度上的有效分（人类覆盖优先），限制在 1–10 */
export function effScore(opp: Opportunity, cid: string): number {
  const v = opp.overrides[cid] ?? opp.scores[cid];
  const n = typeof v === 'number' && !Number.isNaN(v) ? v : 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

/** 加权总分（0–100），保留到 1 位小数 */
export function computeTotal(opp: Opportunity, criteria: Criterion[] = CRITERIA): number {
  const tw = totalWeight(criteria);
  if (tw === 0) return 0;
  let acc = 0;
  for (const c of criteria) {
    acc += c.weight * effScore(opp, c.id);
  }
  // 10 分制 × 权重 → 映射到 0–100
  return Math.round((acc / tw) * 10);
}

export function rankOpportunities(
  opps: Opportunity[],
  criteria: Criterion[] = CRITERIA
): RankedOpportunity[] {
  return opps
    .map((opp) => {
      const total = computeTotal(opp, criteria);
      const detail = criteria.map((c) => {
        const raw = effScore(opp, c.id);
        const weighted = c.weight * raw;
        return {
          criterionId: c.id,
          name: c.short,
          raw,
          weighted,
          human: opp.overrides[c.id] != null,
        };
      });
      return { opp, total, detail };
    })
    .sort((a, b) => b.total - a.total);
}

export function grade(total: number): { label: string; cls: string } {
  if (total >= 80) return { label: 'S · 卓越', cls: 'grade-s' };
  if (total >= 68) return { label: 'A · 优秀', cls: 'grade-a' };
  if (total >= 55) return { label: 'B · 良好', cls: 'grade-b' };
  if (total >= 42) return { label: 'C · 一般', cls: 'grade-c' };
  return { label: 'D · 待定', cls: 'grade-d' };
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
