import Link from 'next/link';
import { getRadarItems, getLatestIssue, getOpportunities, getMarketPulse, formatShortLabel } from '@/lib/data';
import { Header } from '@/components/page-shell';
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
      <div className="container page-wrap">
        <header className="product-intro">
          <p className="product-eyebrow">AI OPC · 一人公司机会情报</p>
          <h1>从 AI 的新可能，<br />找到你值得验证的下一步。</h1>
          <p>为设计师、开发者和专业服务者整理真实案例与创业信号。看清客户、证据和风险，再决定是否投入时间。</p>
          <div className="product-actions"><Link href="/explore" className="product-action">找到适合我的方向</Link><Link href="/opportunities" className="product-action secondary">浏览公开机会</Link></div>
          <p className="product-note">公开资讯免费阅读 · 方向探测器可先看示例，登录后开始研究</p>
        </header>

        {/* ═══ 最新机会（头条大卡 + 副卡） ═══ */}
        {featured && (
          <section className="home-section">
            <div className="home-section-head">
              <h2 className="home-section-title">值得进一步研究的机会</h2>
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

        <section className="reading-cta" aria-labelledby="subscribe-title">
          <div><h2 id="subscribe-title">每周，留一点时间给新的可能。</h2><p>免费阅读已发布周报，用 RSS 跟进新的案例、来源与验证思路。</p></div>
          <div className="product-actions"><Link className="product-action secondary" href="/feed.xml">订阅 RSS</Link><Link href={latest ? `/weekly/${latest.slug}` : '/archive'}>先读一期周报</Link></div>
        </section>

        {/* 本站采集量，不能代替市场规模或增长数据。 */}
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

        <div className="page-disclaimer">
          <p>AI × 一人公司创业机会情报 · 机会判断 + 每日信号 + 每周精选</p>
        </div>
      </div>
    </>
  );
}
