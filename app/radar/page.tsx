import { getRadarItems } from '@/lib/data';
import { Header } from '@/components/page-shell';
import { PageViewCounter } from '@/components/page-view-counter';
import { RadarCard, dayKey, dayLabel } from '@/components/radar-card';
import type { RadarItem } from '@/lib/types';

export const revalidate = 300;

export default async function RadarPage() {
  const items = await getRadarItems();

  // 按日期分组
  const byDate: Record<string, RadarItem[]> = {};
  for (const it of items) {
    const key = dayKey(it.published_at);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(it);
  }
  const sortedDays = Object.keys(byDate).sort().reverse();

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 80, display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">OPC RADAR</h1>
            <p className="x-pagehead-meta">一人雷达 · 每日扫描 AI × 一人公司创业信号</p>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="radar-empty">
            <p className="radar-empty-title">雷达待机中</p>
            <p className="radar-empty-sub">每日 07:00 扫描</p>
          </div>
        ) : (
          sortedDays.map(key => (
            <section key={key} className="x-date-group">
              <div className="x-date-label">{dayLabel(key)} · {byDate[key].length} 条</div>
              <div className="radar-list">
                {byDate[key].map(it => <RadarCard key={it.id} item={it} />)}
              </div>
            </section>
          ))
        )}

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p style={{ marginBottom: 6 }}><PageViewCounter /></p>
          <p>快讯由 AI 筛选生成，点击标题跳转原始信源。</p>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
