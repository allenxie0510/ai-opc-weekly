import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/page-shell';
import { ProductVisual } from '@/components/product-radar/ProductVisual';
import { isProductRadarEnabled, isToolsEnabled } from '@/lib/product-radar/config';

export const metadata: Metadata = {
  title: '工具 · AI OPC',
  description: '为一人公司提供的轻量决策工具。',
};

export default function ToolsPage() {
  if (!isToolsEnabled()) notFound();
  const enabled = isProductRadarEnabled();
  return (
    <><Header /><main className="container page-wrap pr-tools-page">
      <header className="pr-tools-hero"><span className="pr-kicker">AI OPC TOOLKIT</span><h1>把信息变成今天能执行的决策</h1><p>工具层不追求更多数据，只帮一人公司缩小选择范围、看清证据和最低成本的下一步。</p></header>
      {enabled ? <section className="pr-tool-grid" aria-label="AI OPC 工具">
        <Link href="/tools/xhs-product-radar" className="pr-tool-card">
          <ProductVisual slug="xhs-product-radar" title="小红书选品雷达" compact />
          <div><span className="pr-tool-status">β Fixture 可用</span><h2>小红书选品雷达</h2><p>从内容信号、竞争窗口、一件代发、利润和风险中，每天筛出少量值得测试的商品机会。</p><strong>进入工具 →</strong></div>
        </Link>
      </section> : <div className="pr-empty"><strong>工具正在准备中</strong><p>新工具已被 Feature Flag 隔离，不影响其他 AI OPC 功能。</p></div>}
    </main></>
  );
}
