import Link from 'next/link';
import { getRadarItems, getLatestIssue, getOpportunities, getMarketPulse, formatShortLabel } from '@/lib/data';
import { Header } from '@/components/page-shell';
import { PageViewCounter } from '@/components/page-view-counter';
import { RadarCard, dayKey, dayLabel } from '@/components/radar-card';
import { OpportunityCard, FeaturedOpportunity } from '@/components/OpportunityCard';
import { MarketPulse } from '@/components/market-pulse';

export const revalidate = 300;

export default async function Home() {
  const [items, latest, opps, pulse] = await Promise.all([
    getRadarItems(),
    getLatestIssue(),
    getOpportunities(),
    getMarketPulse(),
  ]);

  // 今日雷达：取最近一天的快讯，首页最多展示 4 条
  const latestDay = items.length > 0 ? dayKey(items[0].published_at) : null;
  const todayItems = latestDay
    ? items.filter(it => dayKey(it.published_at) === latestDay).slice(0, 4)
    : [];

  // 机会推荐位：手动推荐位（featured=true，admin 设置）优先，副条取最新 2 条；
  // 未设置时按「最新批次轮换」——最新 3 条 published 中分数最高者进 hero，批次内另外 2 条做副卡。
  // 轮换效果：admin 每发布一批新机会，hero 自动换成该批最高分，旧批次自然退下，不会按分数长期霸榜
  const pinned = opps.find((o) => o.featured) ?? null;
  const latestBatch = opps.slice(0, 3);
  const batchBest = latestBatch.length
    ? latestBatch.reduce((a, b) => (b.score_total > a.score_total ? b : a))
    : null;
  const featured = pinned ?? batchBest;
  const secondary = pinned
    ? opps.filter((o) => o.id !== pinned.id).slice(0, 2)
    : latestBatch.filter((o) => o.id !== featured?.id);

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

        {/* ═══ 最新机会（头条大卡 + 副卡） ═══ */}
        {featured && (
          <section className="home-section">
            <div className="home-section-head">
              <h2 className="home-section-title">最新机会</h2>
              <Link href="/opportunities" className="home-more">全部机会 →</Link>
            </div>

            <FeaturedOpportunity opportunity={featured} />

            {secondary.length > 0 && (
              <div className="home-opp-grid">
                {secondary.map(o => <OpportunityCard key={o.id} opportunity={o} />)}
              </div>
            )}
          </section>
        )}

        {/* ═══ 赛道脉搏（P3.2：近 7 天 vs 前 7 天信号动量，空数据不渲染） ═══ */}
        <MarketPulse items={pulse} />

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
