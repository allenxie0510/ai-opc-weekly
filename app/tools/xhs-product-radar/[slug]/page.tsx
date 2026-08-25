import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/page-shell';
import { ProductVisual } from '@/components/product-radar/ProductVisual';
import { RadarBadges, ScoreDial } from '@/components/product-radar/Badges';
import { TrendChart } from '@/components/product-radar/TrendChart';
import { ScoreBreakdown } from '@/components/product-radar/ScoreBreakdown';
import { ProfitCalculator } from '@/components/product-radar/ProfitCalculator';
import { SupplyOffers } from '@/components/product-radar/SupplyOffers';
import { WatchlistButton } from '@/components/product-radar/WatchlistButton';
import { OpportunityViewEvent } from '@/components/product-radar/OpportunityViewEvent';
import { getFixtureOpportunities } from '@/lib/product-radar/fixtures';
import { isProductRadarEnabled, isStale } from '@/lib/product-radar/config';
import { canAccessProductRadar } from '@/lib/product-radar/access';
import { getProductRadarRepository } from '@/lib/product-radar/repository';
import { EVIDENCE_DESCRIPTIONS, RISK_LABELS, STAGE_LABELS } from '@/lib/product-radar/presentation';

export const revalidate = 300;

export function generateStaticParams() {
  return isProductRadarEnabled() ? getFixtureOpportunities().map((item) => ({ slug: item.slug })) : [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!(await canAccessProductRadar())) notFound();
  const { slug } = await params;
  const item = await getProductRadarRepository().getBySlug(slug);
  return item ? { title: `${item.title} · 小红书选品雷达`, description: item.whyNow } : { title: '商品机会未找到' };
}

export default async function ProductOpportunityPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await canAccessProductRadar())) notFound();
  const { slug } = await params;
  const item = await getProductRadarRepository().getBySlug(slug);
  if (!item) notFound();
  const stale = isStale(item.dataAsOf);
  return (
    <><Header /><OpportunityViewEvent slug={item.slug} /><main className="container page-wrap pr-detail">
      <nav className="pr-breadcrumb"><Link href="/tools/xhs-product-radar">← 今日机会</Link></nav>
      {item.dataMode === 'fixture' && <div className="pr-detail-fixture">此页为 Fixture 演示数据；可完整体验流程，不应把数值当作实时行情。</div>}
      {stale && <div className="pr-stale">证据快照已超过 48 小时，决策前请重新核验。</div>}
      <header className="pr-detail-hero">
        <div className="pr-detail-copy"><span className="pr-kicker">{item.category} · {STAGE_LABELS[item.stage].toUpperCase()}</span><RadarBadges opportunity={item} /><h1>{item.title}</h1><p className="pr-detail-lead">{item.shortDescription}</p><div className="pr-detail-actions"><WatchlistButton slug={item.slug} /><a href="#test-plan">跳到最低成本测试 ↓</a></div><p className="pr-asof">证据截止 {new Date(item.dataAsOf).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · {item.providers.join(' · ')}</p></div>
        <div className="pr-detail-score"><ProductVisual slug={item.slug} title={item.title} /><ScoreDial score={item.score.finalScore} /><div><span>置信度 <strong>{item.confidence}</strong></span><span>证据 {item.evidenceGrade} · {EVIDENCE_DESCRIPTIONS[item.evidenceGrade]}</span></div></div>
      </header>
      <section className="pr-section pr-verdict"><div className="pr-section-head"><span>01</span><div><h2>先看结论</h2><p>机会质量、证据和风险分开表达</p></div></div><div className="pr-verdict-grid"><article><span>当前决策</span><strong>{item.decision}</strong><p>{item.decisionReason}</p></article><article><span>为什么是现在</span><p>{item.whyNow}</p></article></div><ul className="pr-evidence-list">{item.topSignals.map((signal) => <li key={signal.id}><span>{signal.provider}</span><strong>{String(signal.value)}</strong><p>{signal.note}</p><time dateTime={signal.capturedAt}>{signal.capturedAt.slice(0, 10)}</time></li>)}</ul></section>
      <section className="pr-section"><div className="pr-section-head"><span>02</span><div><h2>机会分如何得出</h2><p>动量 25% · 内容 20% · 竞争/供货/利润各 15% · 时机 10%</p></div></div><ScoreBreakdown score={item.score} confidence={item.confidence} /></section>
      <section className="pr-section"><div className="pr-section-head"><span>03</span><div><h2>趋势窗口</h2><p>归一化趋势，不冒充平台搜索量</p></div></div><div className="pr-trend-grid"><article><h3>7 日</h3><TrendChart points={item.trend7d} label="7日趋势" /></article><article><h3>30 日</h3><TrendChart points={item.trend30d} label="30日趋势" /></article></div></section>
      <section className="pr-section"><div className="pr-section-head"><span>04</span><div><h2>内容可表达性</h2><p>LLM 只提供解释与角度，不改写机会分</p></div></div><div className="pr-content-grid"><article><h3>为什么适合拍</h3><ul>{item.contentabilityReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></article><article><h3>最多 5 个起步角度</h3><ol>{item.contentAngles.map((angle) => <li key={angle}>{angle}</li>)}</ol></article></div></section>
      <section className="pr-section"><div className="pr-section-head"><span>05</span><div><h2>1688 一件代发供货</h2><p>最多展示 5 个规范化供应样本，不声称实时库存</p></div></div><SupplyOffers offers={item.supplyOffers} slug={item.slug} /></section>
      <section className="pr-section"><div className="pr-section-head"><span>06</span><div><h2>动态利润试算</h2><p>修改任何参数，即时看贡献利润和推广上限</p></div></div><ProfitCalculator defaults={item.profitDefaults} slug={item.slug} /></section>
      <section className="pr-section"><div className="pr-section-head"><span>07</span><div><h2>风险门</h2><p>当前总体风险：{RISK_LABELS[item.riskLevel]}</p></div></div><div className="pr-risk-grid">{item.risks.map((risk) => <article key={risk.id} className={`risk-${risk.level}`}><span>{RISK_LABELS[risk.level]}</span><h3>{risk.title}</h3><p>{risk.detail}</p><strong>应对：{risk.mitigation}</strong></article>)}</div></section>
      <section className="pr-section pr-test-plan" id="test-plan"><div className="pr-section-head"><span>08</span><div><h2>最低成本测试方案</h2><p>先买证据，再买库存</p></div></div><div className="pr-test-meta"><div><span>预算</span><strong>{item.testPlan.budget}</strong></div><div><span>周期</span><strong>{item.testPlan.duration}</strong></div></div><ol>{item.testPlan.steps.map((step) => <li key={step}>{step}</li>)}</ol><div className="pr-threshold"><p><strong>通过阈值</strong>{item.testPlan.successThreshold}</p><p><strong>止损条件</strong>{item.testPlan.killCondition}</p></div></section>
      <section className="pr-section pr-provenance"><div className="pr-section-head"><span>09</span><div><h2>来源与限制</h2><p>对不知道的事保持明确</p></div></div><ul>{item.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul><p>数据 Provider：{item.providers.join(' · ')}。本产品不会绕过小红书登录、验证码、反爬或风控机制。</p></section>
      <footer className="pr-footer"><Link href="/tools/xhs-product-radar">← 返回今日机会</Link><p>© 2026 AI OPC. 不构成投资或库存建议。</p></footer>
    </main></>
  );
}
