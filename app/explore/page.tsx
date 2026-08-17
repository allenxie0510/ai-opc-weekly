import type { Metadata } from 'next';
import { Header } from '@/components/page-shell';
import { PageViewCounter } from '@/components/page-view-counter';
import { ExploreApp } from '@/modules/explore/ExploreApp';

export const metadata: Metadata = {
  title: '方向探测器 · AI OPC',
  description:
    '用孙正义 19 岁的方法，把「想做」变成「该做 + 本周第一步」：海量生成 → 系统筛选 → 逆向规划。',
};

export default function ExplorePage() {
  return (
    <>
      <Header />
      <div
        className="container"
        style={{ paddingTop: 48, paddingBottom: 80, display: 'flex', flexDirection: 'column', minHeight: '100svh' }}
      >
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">方向探测器</h1>
            <p className="x-pagehead-meta">
              用孙正义 19 岁的方法：海量生成 → 系统筛选 → 逆向规划，把「想做」变成「该做 + 本周做什么」
            </p>
          </div>
        </header>

        <ExploreApp />

        <footer
          style={{
            textAlign: 'center',
            padding: '48px 0',
            color: 'var(--color-stone)',
            fontSize: '0.8rem',
            marginTop: 'auto',
          }}
        >
          <p style={{ marginBottom: 6 }}>
            <PageViewCounter />
          </p>
          <p>方向与规划由 AI 生成，仅供参考，不构成投资建议。</p>
          <p>© 2026 AI OPC. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
