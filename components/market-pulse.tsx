import Link from 'next/link';
import type { MarketPulseItem } from '@/lib/types';
import { LineIcon } from '@/components/icons';

/**
 * 赛道脉搏（P3.2）：首页全局视角区块，近 7 天 vs 前 7 天信号动量。
 * 纯读取侧聚合（getMarketPulse），空数据整个区块不渲染（无占位）。
 */

/** 14 天迷你 sparkline：手写 SVG polyline，60×20，颜色随趋势 */
function PulseSparkline({ daily, trend }: { daily: number[]; trend: MarketPulseItem['trend'] }) {
  const W = 60, H = 20, P = 2;
  const max = Math.max(...daily, 1);
  const pts = daily.map((v, i) => {
    const x = P + (i * (W - 2 * P)) / (daily.length - 1);
    const y = P + (1 - v / max) * (H - 2 * P);
    return { x, y };
  });
  const color = trend === 'up' ? 'var(--color-up)' : trend === 'down' ? 'var(--color-down)' : 'var(--color-stone)';
  const last = pts[pts.length - 1];
  return (
    <svg className="pulse-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`近 14 天信号量：${daily.join(',')}`}>
      <polyline
        points={pts.map(p => `${p.x},${p.y}`).join(' ')}
        fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r="2" fill={color} />
    </svg>
  );
}

function DeltaPill({ p }: { p: MarketPulseItem }) {
  if (p.prevWeekCount < 5 || p.weekCount < 5) {
    return <span className="pulse-delta flat">{p.prevWeekCount} → {p.weekCount} 条 · 样本较少</span>;
  }
  if (p.trend === 'up') {
    return <span className="pulse-delta up"><LineIcon name="trending-up" /> {p.deltaPct === null ? '新增收录' : `+${p.deltaPct}%`}</span>;
  }
  if (p.trend === 'down') {
    return <span className="pulse-delta down"><LineIcon name="trending-down" /> {p.deltaPct}%</span>;
  }
  return <span className="pulse-delta flat">→ 持平</span>;
}

export function MarketPulse({ items }: { items: MarketPulseItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2 className="home-section-title">
          本站信号活跃度
          <span className="home-section-sub">近 7 天 vs 前 7 天 · 已收录条数</span>
        </h2>
        <Link href="/radar" className="home-more">全部快讯 →</Link>
      </div>
      <p className="product-note">仅反映本站采集与发布数量，受来源覆盖和更新频率影响，不代表市场规模、增长或衰退。任一周期少于 5 条时只展示条数。</p>
      <div className="pulse-grid">
        {items.map(p => (
          <div key={p.category} className="pulse-card">
            <div className="pulse-card-head">
              <span className={`art-cat-pill ${p.cssClass}`}>{p.label}</span>
              <DeltaPill p={p} />
            </div>
            <div className="pulse-card-main">
              <span className="pulse-count">{p.weekCount}<em>条 / 7天</em></span>
              <PulseSparkline daily={p.daily} trend={p.trend} />
            </div>
            {p.topSignals.length > 0 && (
              <ul className="pulse-tops">
                {p.topSignals.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
