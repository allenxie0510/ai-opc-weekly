import Link from 'next/link';
import { getRadarItems, getLatestIssue, getOpportunities, formatShortLabel } from '@/lib/data';
import { Header } from '@/components/page-shell';
import { PageViewCounter } from '@/components/page-view-counter';
import { RadarCard, dayKey, dayLabel } from '@/components/radar-card';
import { CATEGORY_MAP, RECOMMENDATION_MAP } from '@/lib/types';

export const revalidate = 300;

export default async function Home() {
  const [items, latest, opps] = await Promise.all([
    getRadarItems(),
    getLatestIssue(),
    getOpportunities(),
  ]);

  // 今日雷达：取最近一天的快讯，首页最多展示 4 条
  const latestDay = items.length > 0 ? dayKey(items[0].published_at) : null;
  const todayItems = latestDay
    ? items.filter(it => dayKey(it.published_at) === latestDay).slice(0, 4)
    : [];

  // 机会：最高分 1 个做头条，其余最多 2 个做副条（按 score_total 降序，data 层已排序）
  const featured = opps[0] || null;
  const secondary = opps.slice(1, 3);

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 80, display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">AI OPC</h1>
            <p className="x-pagehead-meta">AI × 一人公司创业机会情报 · 机会判断 + 每日信号 + 每周精选</p>
          </div>
        </header>

        {/* ═══ 最新机会（头条） ═══ */}
        {featured && (
          <section className="home-section">
            <div className="home-section-head">
              <h2 className="home-section-title">最新机会</h2>
              <Link href="/opportunities" className="home-more">全部机会 →</Link>
            </div>

            <Link href={`/opportunities/${featured.slug}`} className="home-opp-hero">
              <div className="home-opp-hero-top">
                <span className={`opp-rec lg ${RECOMMENDATION_MAP[featured.recommendation]?.cssClass || 'rec-watch'}`}>
                  {RECOMMENDATION_MAP[featured.recommendation]?.label || featured.recommendation}
                </span>
                <span className="home-opp-hero-score">
                  <em>机会评分</em>{featured.score_total}
                </span>
              </div>
              <h3 className="home-opp-hero-title">{featured.title}</h3>
              {featured.thesis && <p className="home-opp-hero-thesis">{featured.thesis}</p>}
              {featured.editor_take && <p className="home-opp-hero-take">🖊 {featured.editor_take}</p>}
              <div className="opp-card-meta">
                <span className={`opp-evidence grade-${featured.evidence_grade}`}>Evidence {featured.evidence_grade}</span>
                {featured.category && CATEGORY_MAP[featured.category] && (
                  <span className={`art-cat-pill ${CATEGORY_MAP[featured.category].cssClass}`}>{CATEGORY_MAP[featured.category].label}</span>
                )}
                <span className="home-opp-cta">查看完整判断（评分/验证计划/证据链）→</span>
              </div>
            </Link>

            {secondary.length > 0 && (
              <div className="home-opp-grid">
                {secondary.map(o => (
                  <Link key={o.id} href={`/opportunities/${o.slug}`} className="opp-card">
                    <div className="opp-card-top">
                      <span className={`opp-rec ${RECOMMENDATION_MAP[o.recommendation]?.cssClass || 'rec-watch'}`}>
                        {RECOMMENDATION_MAP[o.recommendation]?.label || o.recommendation}
                      </span>
                      <span className="opp-score">{o.score_total}</span>
                    </div>
                    <h3 className="opp-card-title" style={{ fontSize: '1.05rem' }}>{o.title}</h3>
                    {o.thesis && <p className="opp-card-thesis">{o.thesis}</p>}
                    <div className="opp-card-meta">
                      <span className={`opp-evidence grade-${o.evidence_grade}`}>证据 {o.evidence_grade} 级</span>
                      {(o.published_at || '').slice(0, 10)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

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
            <Link href={`/weekly/${latest.slug}`} className="home-weekly-card">
              <span className="home-weekly-label">{formatShortLabel(latest)}</span>
              <span className="home-weekly-title">{latest.title}</span>
              {latest.summary && <span className="home-weekly-summary">{latest.summary}</span>}
              <span className="home-weekly-cta">阅读本期 →</span>
            </Link>
          ) : (
            <div className="radar-empty">
              <p className="radar-empty-title">暂无已发布的周报</p>
            </div>
          )}
        </section>

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p style={{ marginBottom: 6 }}><PageViewCounter /></p>
          <p>AI × 一人公司创业机会情报 · 机会判断 + 每日信号 + 每周精选</p>
          <p>© 2026 AI OPC. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
