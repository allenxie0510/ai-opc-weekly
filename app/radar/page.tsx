import { CategoryHero } from '@/components/category-hero';
import { getRadarItems } from '@/lib/data';
import { Header } from '@/components/page-shell';
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
      <div className="container page-wrap">
        <CategoryHero section="radar" title="每日信号"><p>扫描 AI × 一人公司的新变化，从信号中发现下一步。</p></CategoryHero>

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

        <div className="page-disclaimer">
          <p>快讯由 AI 筛选生成，点击标题跳转原始信源。</p>
        </div>
      </div>
    </>
  );
}
