import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/page-shell';
import { RadarFeed } from '@/components/product-radar/RadarFeed';
import { isProductRadarEnabled } from '@/lib/product-radar/config';
import { getProductRadarRepository } from '@/lib/product-radar/repository';

export const revalidate = 300;
export const metadata: Metadata = {
  title: '小红书选品雷达 · AI OPC',
  description: '小红书内容信号 → 商品机会 → 1688 一件代发 → 利润 → 风险 → 最低成本测试建议。',
};

export default async function ProductRadarPage() {
  if (!isProductRadarEnabled()) notFound();
  const feed = await getProductRadarRepository().list();
  return (
    <><Header /><main className="container page-wrap pr-page">
      <nav className="pr-breadcrumb"><Link href="/tools">← 工具</Link></nav>
      <header className="pr-hero">
        <div><span className="pr-kicker">XIAOHONGSHU PRODUCT RADAR</span><h1>每天只看少量<br />值得测试的商品机会</h1><p>不是商品大全。先看内容信号，再经过竞争、供货、利润和风险门，最后只给出可小成本验证的候选。</p></div>
        <div className="pr-decision-chain" aria-label="选品决策链"><span>内容信号</span><i>→</i><span>机会识别</span><i>→</i><span>供货与利润</span><i>→</i><span>风险与测试</span></div>
      </header>
      <section className={`pr-mode-banner ${feed.mode}`} aria-label="数据模式">
        <div><strong>{feed.mode === 'fixture' ? '演示数据模式' : '授权数据模式'}</strong><p>{feed.mode === 'fixture' ? '完整决策链可用，但数值不是小红书实时搜索量或 1688 实时库存。' : '数据已由配置的授权 Provider 正式提供。'}</p></div>
        <dl><div><dt>信号</dt><dd>{feed.run.scannedSignals ?? '—'}</dd></div><div><dt>机会</dt><dd>{feed.run.publishedOpportunities}</dd></div><div><dt>本次运行</dt><dd>{feed.run.status === 'success' ? '完整' : feed.run.status === 'partial' ? '带兜底' : '失败'}</dd></div></dl>
      </section>
      {feed.stale && <div className="pr-stale" role="status">数据已超过 48 小时未更新，请把结果视为历史参考。</div>}
      <RadarFeed items={feed.items} categories={feed.categories} />
      <footer className="pr-footer"><p>机会分由确定性规则计算，AI 只负责语义解释与测试方案。所有结论都需买样验证。</p><p>© 2026 AI OPC. 不构成投资或库存建议。</p></footer>
    </main></>
  );
}
