import Link from 'next/link';
import { CATEGORY_MAP, RECOMMENDATION_MAP } from '@/lib/types';
import type { Category, Opportunity } from '@/lib/types';
import { CoverImg } from './opportunity-cover-img';

/**
 * 机会卡片 v2 · MicroConf 式封面卡
 * 顶部 16:10 封面（AI 概念图 / 程序化兜底），左下叠 recommendation 胶囊、右上叠评分徽章；
 * 图下：标题（2行截断）→ thesis 摘要（2行截断）→ 元信息 → 深色 CTA
 * variant="featured" 为首页头条大卡（封面更宽、字号更大、多一行主编判断）
 */

// 兜底封面配色：按 category 映射渐变底色 + 单色强调（与站点色板同源的柔和色）
const FALLBACK_THEMES: Record<string, { from: string; to: string; accent: string }> = {
  'micro-saas':       { from: '#e9effc', to: '#f7f9ff', accent: '#1456f0' },
  'design-assets':    { from: '#fdeff7', to: '#fff8fc', accent: '#ec4899' },
  'automation':       { from: '#f0edfd', to: '#f9f7ff', accent: '#8b5cf6' },
  'content-monetize': { from: '#e8f8f1', to: '#f4fbf8', accent: '#10b981' },
  'indie-tool':       { from: '#fdf3e2', to: '#fffaf2', accent: '#f59e0b' },
  'digital-product':  { from: '#ececfb', to: '#f7f7ff', accent: '#6366f1' },
};
const DEFAULT_THEME = { from: '#f2f3f5', to: '#fafbfc', accent: '#a8aab2' };

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 程序化兜底封面：渐变底 + 确定性几何 SVG 纹理（任何情况下卡片都有"图"） */
export function CoverFallback({ category, seed }: { category?: Category | null; seed: string }) {
  const theme = (category && FALLBACK_THEMES[category]) || DEFAULT_THEME;
  const gid = `g${hashSeed(seed || 'opp') % 100000}`;
  const h = hashSeed(seed || 'opp');
  // 由 seed 确定性派生的几何元素位置
  const cx = 30 + (h % 100);          // 主圆心 x: 30–130
  const cy = 25 + ((h >> 3) % 50);    // 主圆心 y: 25–75
  const r = 16 + ((h >> 5) % 14);     // 主圆半径: 16–30
  const sqX = 90 + ((h >> 7) % 50);   // 方块 x: 90–140
  const sqY = 40 + ((h >> 9) % 40);   // 方块 y: 40–80
  const sqS = 12 + ((h >> 11) % 10);  // 方块边长: 12–22
  const rot = (h >> 4) % 45;          // 方块旋转角
  const rx = 10 + ((h >> 13) % 30);   // 圆环 x
  const ry = 55 + ((h >> 15) % 35);   // 圆环 y
  return (
    <div className="opcard-fallback" aria-hidden="true">
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={theme.from} />
            <stop offset="100%" stopColor={theme.to} />
          </linearGradient>
        </defs>
        <rect width="160" height="100" fill={`url(#${gid})`} />
        <circle cx={cx} cy={cy} r={r} fill={theme.accent} opacity="0.22" />
        <circle cx={cx} cy={cy} r={Math.max(4, r - 9)} fill={theme.accent} opacity="0.16" />
        <rect
          x={sqX} y={sqY} width={sqS} height={sqS} rx="2"
          fill={theme.accent} opacity="0.28"
          transform={`rotate(${rot} ${sqX + sqS / 2} ${sqY + sqS / 2})`}
        />
        <circle cx={rx} cy={ry} r="7" fill="none" stroke={theme.accent} strokeWidth="2" opacity="0.3" />
        <circle cx={150 - rx / 2} cy={100 - ry / 3} r="3" fill={theme.accent} opacity="0.35" />
      </svg>
    </div>
  );
}

/** 封面视觉（含兜底 + 真图覆盖），详情页 hero 也可复用 */
export function OpportunityCoverVisual({ opportunity: o, className }: { opportunity: Opportunity; className?: string }) {
  return (
    <div className={`opcard-cover${className ? ` ${className}` : ''}`}>
      <CoverFallback category={o.category} seed={o.slug || o.id} />
      {o.cover_url && <CoverImg src={o.cover_url} alt={o.title} />}
    </div>
  );
}

export function OpportunityCard({ opportunity: o, variant = 'default' }: { opportunity: Opportunity; variant?: 'default' | 'featured' }) {
  const rec = RECOMMENDATION_MAP[o.recommendation] || RECOMMENDATION_MAP.WATCH;
  const cat = o.category ? CATEGORY_MAP[o.category] : null;
  const date = (o.published_at || '').slice(0, 10);
  return (
    <Link href={`/opportunities/${o.slug}`} className={`opcard${variant === 'featured' ? ' featured' : ''}`}>
      <div className="opcard-cover">
        <CoverFallback category={o.category} seed={o.slug || o.id} />
        {o.cover_url && <CoverImg src={o.cover_url} alt={o.title} />}
        <span className="opcard-rec">{rec.label}</span>
        <span className="opcard-score">
          <em>OPC</em>{o.score_total}
          {o.score_trend === 'up' && <span className="opcard-trend up" title="评分轨迹上行">↗</span>}
          {o.score_trend === 'down' && <span className="opcard-trend down" title="评分轨迹下行">↘</span>}
        </span>
      </div>
      <div className="opcard-body">
        <h3 className="opcard-title">{o.title}</h3>
        {o.thesis && <p className="opcard-thesis">{o.thesis}</p>}
        {variant === 'featured' && o.editor_take && <p className="opcard-take">🖊 {o.editor_take}</p>}
        <div className="opcard-meta">
          <span className={`opp-evidence grade-${o.evidence_grade}`}>证据 {o.evidence_grade} 级</span>
          {cat && <span className={`art-cat-pill ${cat.cssClass}`}>{cat.label}</span>}
          {date && <span>{date}</span>}
        </div>
        <div className="opcard-cta"><span>查看完整判断 →</span></div>
      </div>
    </Link>
  );
}
