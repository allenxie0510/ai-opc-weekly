import { getTweets, getTwitterAccounts } from '@/lib/data';
import { Header } from '@/components/page-shell';
import { TranslateButton } from '@/components/translate-button';
import { SafeImg } from '@/components/safe-img';
import { PageViewCounter } from '@/components/page-view-counter';
import Link from 'next/link';

export const revalidate = 300;

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

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export default async function XTimelinePage() {
  const tweets = await getTweets({ limit: 50 });
  const accounts = await getTwitterAccounts();
  const accountCount = accounts.length;

  // 按日期分组
  const byDate: Record<string, typeof tweets> = {};
  for (const t of tweets) {
    const key = fmtDate(t.published_at);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(t);
  }

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">X 时间轴</h1>
            <p className="x-pagehead-meta">
              追踪 {accountCount} 位 AI 圈大佬 · 共 {tweets.length} 条推文
            </p>
          </div>
          <Link href="/x/accounts" className="x-manage-link">管理账号 →</Link>
        </header>

        {tweets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-stone)' }}>
            暂无推文。请先在 Supabase 中运行迁移脚本写入种子数据和推文。
          </div>
        ) : (
          Object.keys(byDate).sort().reverse().map(date => (
            <section key={date} className="x-date-group">
              <div className="x-date-label">{date}</div>
              <div className="x-timeline">
                {byDate[date].map((t) => (
                  <article key={t.id} className="x-card">
                    {/* 头像 + 名字行（左对齐，仿X） */}
                    <div className="x-card-head">
                      <a
                        href={`https://x.com/${t.author_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="x-card-avatar-wrap"
                      >
                        <img
                          src={t.author_avatar_url || `https://unavatar.io/x/${t.author_username}`}
                          alt=""
                          className="x-card-avatar"
                          width={44}
                          height={44}
                          loading="lazy"
                        />
                      </a>
                      </div>

                    {/* 右侧内容区 */}
                    <div className="x-card-body">
                      <div className="x-card-meta">
                        <a
                          href={`https://x.com/${t.author_username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="x-card-name"
                        >
                          {t.author_display_name || t.author_username}
                        </a>
                        <a
                          href={`https://x.com/${t.author_username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="x-card-handle"
                        >
                          @{t.author_username}
                        </a>
                        <span className="x-card-sep">·</span>
                        <time className="x-card-time">{timeAgo(t.published_at)}</time>
                      </div>

                      <a
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="x-card-text"
                      >
                        {t.content}
                      </a>

                      <TranslateButton key={t.tweet_id} tweetId={t.tweet_id} text={t.content} />

                      {t.media_urls && t.media_urls.length > 0 && (
                        <div className="x-card-media" data-count={Math.min(t.media_urls.length, 4)}>
                          {t.media_urls.slice(0, 4).map((url, i) => (
                            <a key={i} href={t.url} target="_blank" rel="noopener noreferrer">
                              <SafeImg src={url} alt="" className="x-card-img" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p style={{ marginBottom: 6 }}><PageViewCounter /></p>
          <p>推文来自 X/Twitter，版权归原作者所有。点击正文跳转原始链接。</p>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
