import Link from 'next/link';
import { getRadarItems, getLatestIssue, getWeeklyIssues, formatShortLabel } from '@/lib/data';
import { Header } from '@/components/page-shell';
import { PageViewCounter } from '@/components/page-view-counter';
import { RadarCard, dayKey, dayLabel } from '@/components/radar-card';

export const revalidate = 300;

export default async function Home() {
  const [items, latest, issues] = await Promise.all([
    getRadarItems(),
    getLatestIssue(),
    getWeeklyIssues(),
  ]);

  // 今日雷达：取最近一天的快讯，首页最多展示 4 条
  const latestDay = items.length > 0 ? dayKey(items[0].published_at) : null;
  const todayItems = latestDay
    ? items.filter(it => dayKey(it.published_at) === latestDay).slice(0, 4)
    : [];

  const recentIssues = issues.slice(1, 4); // 最新一期走大卡片，这里取稍早的几期

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 80, display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">AI OPC WEEKLY</h1>
            <p className="x-pagehead-meta">AI × 一人公司创业情报站 · 每日雷达 + 每周精选</p>
          </div>
        </header>

        {/* ═══ 今日雷达 ═══ */}
        <section className="home-section">
          <div className="home-section-head">
            <h2 className="home-section-title">
              今日雷达
              {latestDay && <span className="home-section-sub">{dayLabel(latestDay)} · {items.filter(it => dayKey(it.published_at) === latestDay).length} 条</span>}
            </h2>
            <Link href="/radar" className="home-more">全部快讯 →</Link>
          </div>

          {todayItems.length === 0 ? (
            <div className="radar-empty">
              <p className="radar-empty-title">雷达待机中</p>
              <p className="radar-empty-sub">每日 07:00 扫描 AI × 一人公司创业信号</p>
            </div>
          ) : (
            <div className="radar-list">
              {todayItems.map(it => <RadarCard key={it.id} item={it} />)}
            </div>
          )}
        </section>

        {/* ═══ 本周周报 ═══ */}
        <section className="home-section">
          <div className="home-section-head">
            <h2 className="home-section-title">本周周报</h2>
            <Link href="/archive" className="home-more">归档 →</Link>
          </div>

          {latest ? (
            <>
              <Link href={`/weekly/${latest.slug}`} className="home-weekly-card">
                <span className="home-weekly-label">{formatShortLabel(latest)}</span>
                <span className="home-weekly-title">{latest.title}</span>
                {latest.summary && <span className="home-weekly-summary">{latest.summary}</span>}
                <span className="home-weekly-cta">阅读本期 →</span>
              </Link>

              {recentIssues.length > 0 && (
                <div className="home-issues-row">
                  {recentIssues.map(iss => (
                    <Link key={iss.slug} href={`/weekly/${iss.slug}`} className="home-issue-link">
                      {formatShortLabel(iss)} · {iss.title}
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="radar-empty">
              <p className="radar-empty-title">暂无已发布的周报</p>
            </div>
          )}
        </section>

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p style={{ marginBottom: 6 }}><PageViewCounter /></p>
          <p>AI × 一人公司创业情报站 · 每日雷达 + 每周精选</p>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
