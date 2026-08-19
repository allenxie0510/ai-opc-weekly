/**
 * ScoreBadge · 全站统一分数组件（P1 分数统一）
 *
 * 量纲：全站 0–100。评分轨迹内部是 0–10，展示层一律用 toDisplayScore() ×10 换算。
 * 色阶：≥80 优秀 / 60–79 良好 / 40–59 一般 / <40 偏弱（@theme --color-score-*）
 * 变体：
 *   cover  — 机会卡片封面右上浮层（白底半透明）
 *   inline — 文本流徽章（灰底，首页 hero / 详情页）
 *   text   — 纯文字小字（雷达卡片标题行尾）
 * 图例：所有分数 title 属性统一带 SCORE_SCALE_TEXT 口径说明。
 */

export type ScoreBand = 'excellent' | 'good' | 'fair' | 'weak';

export const SCORE_SCALE_TEXT = 'OPC Score 0–100：≥80 优秀 · 60–79 良好 · 40–59 一般 · <40 偏弱';

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'weak';
}

/** 评分轨迹内部 0–10 → 展示 0–100（四舍五入取整） */
export function toDisplayScore(internal010: number): number {
  return Math.round(internal010 * 10);
}

export function ScoreBadge({
  score,
  variant = 'inline',
  trend,
  suffix,
}: {
  score: number;
  variant?: 'cover' | 'inline' | 'text';
  trend?: 'up' | 'down' | null;
  /** text 变体的尾部单位（如「分」），其余变体不显示 */
  suffix?: string;
}) {
  const band = scoreBand(score);
  return (
    <span className={`score-badge ${variant} sb-${band}`} title={SCORE_SCALE_TEXT}>
      <em>OPC</em>
      <span className="sb-num">{score}{variant === 'text' ? (suffix ?? '分') : ''}</span>
      {trend === 'up' && <span className="opcard-trend up" title="评分轨迹上行">↗</span>}
      {trend === 'down' && <span className="opcard-trend down" title="评分轨迹下行">↘</span>}
    </span>
  );
}
