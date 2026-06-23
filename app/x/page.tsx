import { getTweets, getTwitterAccounts } from '@/lib/data';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

export const revalidate = 300; // ISR 5 min

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default async function XTimelinePage() {
  const tweets = await getTweets({ limit: 50 });
  const accounts = await getTwitterAccounts();
  const accountCount = accounts.length;

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">X 时间轴</h1>
            <p className="x-pagehead-meta">
              追踪 {accountCount} 位 AI 圈大佬推文 · 共 {tweets.length} 条
            </p>
          </div>
          <Link href="/x/accounts" className="x-manage-link">管理账号 →</Link>
        </header>

        <section className="x-timeline">
          {tweets.length === 0 ? (
            <div className="empty" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-stone)' }}>
              暂无推文。请先在 Supabase 中运行迁移脚本写入种子数据和推文。
            </div>
          ) : (
            tweets.map((t) => (
              <article key={t.id} className="x-card">
                <div className="x-card-head">
                  <img
                    src={t.author_avatar_url || `https://unavatar.io/x/${t.author_username}`}
                    alt={t.author_display_name || t.author_username}
                    className="x-card-avatar"
                    width={40} height={40}
                    loading="lazy"
                  />
                  <div className="x-card-author">
                    <span className="x-card-name">{t.author_display_name || t.author_username}</span>
                    <a
                      href={`https://x.com/${t.author_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="x-card-handle"
                    >
                      @{t.author_username}
                    </a>
                    <span className="x-card-sep">·</span>
                    <span className="x-card-time">{timeAgo(t.published_at)}</span>
                  </div>
                </div>

                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="x-card-text"
                >
                  {t.content}
                </a>

                {t.media_urls && t.media_urls.length > 0 && (
                  <div className="x-card-media">
                    {t.media_urls.slice(0, 4).map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="x-card-img"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p>推文来自 X/Twitter，版权归原作者所有。点击正文跳转原始链接。</p>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
