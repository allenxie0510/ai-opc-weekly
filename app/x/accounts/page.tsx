import { getTwitterAccounts } from '@/lib/data';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

export const revalidate = 300;

export default async function XAccountsPage() {
  const accounts = await getTwitterAccounts();

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">X 账号管理</h1>
            <p className="x-pagehead-meta">追踪 {accounts.length} 位 AI 圈推主</p>
          </div>
          <Link href="/x" className="x-manage-link">← 返回时间轴</Link>
        </header>

        <section className="x-timeline">
          {accounts.length === 0 ? (
            <div className="x-card" style={{ textAlign: 'center', color: 'var(--color-stone)', padding: 40 }}>
              暂无账号。请在 Supabase twitter_accounts 表中添加账号。
            </div>
          ) : (
            accounts.map((a) => (
              <article key={a.id} className="x-card">
                <div className="x-card-head">
                  <img
                    src={a.avatar_url || `https://unavatar.io/x/${a.username}`}
                    alt={a.display_name || a.username}
                    className="x-card-avatar"
                    width={40} height={40}
                    loading="lazy"
                  />
                  <div className="x-card-author">
                    <span className="x-card-name">{a.display_name || a.username}</span>
                    <a
                      href={`https://x.com/${a.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="x-card-handle"
                    >
                      @{a.username}
                    </a>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>

        <div style={{
          marginTop: 40, padding: 24,
          background: 'var(--color-surface)', borderRadius: 12,
          fontSize: 13, color: 'var(--color-steel)', lineHeight: 1.8,
        }}>
          <strong style={{ color: 'var(--color-ink)' }}>如何增删账号？</strong>
          <p style={{ marginTop: 8 }}>
            进入 Supabase 后台 → <code style={{ background: 'var(--color-hairline-soft)', padding: '2px 6px', borderRadius: 4 }}>twitter_accounts</code> 表。增删行即可。{' '}
            <code style={{ background: 'var(--color-hairline-soft)', padding: '2px 6px', borderRadius: 4 }}>enabled = false</code> 可停用某个账号。
          </p>
          <p style={{ marginTop: 8 }}>
            推文数据写入 <code style={{ background: 'var(--color-hairline-soft)', padding: '2px 6px', borderRadius: 4 }}>tweets</code> 表，后续会配置定时抓取脚本自动填充。
          </p>
        </div>

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
