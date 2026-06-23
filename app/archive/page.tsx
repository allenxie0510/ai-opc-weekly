import { getWeeklyIssues } from '@/lib/data';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

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
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - var(--header-height, 56px))',
      }}>
        <div className="container" style={{ flex: 1, paddingTop: 48, paddingBottom: 64, display: 'flex', flexDirection: 'column' }}>
        <header style={{ marginBottom: 48 }}>
          <h1 style={{ fontFamily: 'var(--font-brand)', fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>全部周报</h1>
          <p style={{ color: 'var(--color-steel)', fontSize: '0.95rem' }}>AI OPC Weekly 归档</p>
        </header>

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
                      <span className="week-label">W{i.week_number}</span>
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

          <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
            <p>© 2026 AI OPC Weekly. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </>
  );
}
