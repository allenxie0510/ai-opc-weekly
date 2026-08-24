import type { TrendPoint } from '@/lib/product-radar/domain';

export function TrendChart({ points, label }: { points: TrendPoint[]; label: string }) {
  if (points.length < 2) {
    return <div className="pr-chart-empty">趋势数据暂缺，未用插值制造曲线。</div>;
  }
  const width = 620;
  const height = 180;
  const pad = 14;
  const coords = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - point.normalizedInterest / 100) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first = points[0].normalizedInterest;
  const last = points[points.length - 1].normalizedInterest;
  const delta = last - first;
  return (
    <div className="pr-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}：归一化兴趣 ${first} 到 ${last}`}>
        <defs>
          <linearGradient id={`chart-fill-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-blue)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--color-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((line) => <line key={line} x1={pad} x2={width - pad} y1={pad + (1 - line / 100) * (height - pad * 2)} y2={pad + (1 - line / 100) * (height - pad * 2)} className="pr-chart-grid" />)}
        <polygon points={`${pad},${height - pad} ${coords.join(' ')} ${width - pad},${height - pad}`} fill={`url(#chart-fill-${label})`} />
        <polyline points={coords.join(' ')} className="pr-chart-line" />
        <circle cx={coords.at(-1)?.split(',')[0]} cy={coords.at(-1)?.split(',')[1]} r="5" className="pr-chart-dot" />
      </svg>
      <div className="pr-chart-meta"><span>{points[0].date}</span><strong className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '+' : ''}{delta} 点</strong><span>{points.at(-1)?.date}</span></div>
      <p className="pr-chart-caption">只表示同一 Provider 内的 0–100 归一化兴趣，不是搜索量或销量。</p>
    </div>
  );
}
