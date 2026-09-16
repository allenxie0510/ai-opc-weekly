import { CategoryHero } from '@/components/category-hero';
import { getWeeklyIssues } from '@/lib/data';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

export const revalidate = 300;

export default async function ArchivePage() {
  const issues = await getWeeklyIssues();

  const byYear: Record<number, typeof issues> = {};
  issues.forEach(i => {
    if (!byYear[i.year]) byYear[i.year] = [];
    byYear[i.year].push(i);
  });

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  return (
    <>
      <Header />
      <CategoryHero section="weekly" title="每周深读"><p>从真实案例到经营方法，收藏值得反复拆解的创业研究。</p></CategoryHero>
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - var(--header-height, 56px))',
      }}>
        <div className="container page-wrap" style={{ flex: 1 }}>


        {issues.length === 0 ? (
          <div className="empty" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-stone)' }}>
            暂无已发布的周报
          </div>
        ) : (
          Object.keys(byYear).sort((a, b) => Number(b) - Number(a)).map(year => (
            <div key={year} style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 12, color: 'var(--color-ink)' }}>{year}</h2>
              <div className="archive-list">
                {byYear[Number(year)].map((i) => (
                  <Link key={i.slug} href={`/weekly/${i.slug}`} className="archive-item">
                    <div>
                      <span className="week-label">W{i.week_number}</span><strong className="archive-title">{i.title}</strong>
                      <span className="date" style={{ marginLeft: 12 }}>
                        {fmtDate(i.week_start)}–{fmtDate(i.week_end)}
                      </span>
                    </div>
                    <span className="arrow">→</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}

        </div>
      </div>
    </>
  );
}
