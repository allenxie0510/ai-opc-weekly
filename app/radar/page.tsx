import { getRadarItems, getRadarRejected } from '@/lib/data';
import { Header } from '@/components/page-shell';
import { PageViewCounter } from '@/components/page-view-counter';
import { CATEGORY_MAP } from '@/lib/types';
import type { RadarItem } from '@/lib/types';

export const revalidate = 300;

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

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

/** 分组 key：按自然日（本地时区） */
function dayKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

function scoreClass(score: number): string {
  if (score >= 80) return 'radar-score high';
  if (score >= 60) return 'radar-score mid';
  return 'radar-score';
}

function RadarCard({ item }: { item: RadarItem }) {
  const cat = item.category ? CATEGORY_MAP[item.category] : null;
  return (
    <article className="radar-card">
      <div className="radar-card-top">
        <span className={scoreClass(item.score)}>{item.score}</span>
        {cat && <span className={`art-cat-pill ${cat.cssClass}`}>{cat.label}</span>}
        {item.pick_reason && <span className="radar-pick">{item.pick_reason}</span>}
        <span className="radar-meta">
          {item.source_name}
          <span className="radar-meta-sep">·</span>
          <time>{timeAgo(item.published_at)}</time>
        </span>
      </div>

      <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="radar-title">
        {item.title}
      </a>

      {item.summary && <p className="radar-summary">{item.summary}</p>}

      {item.editor_note && (
        <blockquote className="radar-editor-note">
          <span className="radar-editor-label">编辑点评</span>
          {item.editor_note}
        </blockquote>
      )}
    </article>
  );
}

export default async function RadarPage() {
  const items = await getRadarItems();
  const rejected = await getRadarRejected();

  // 按日期分组
  const byDate: Record<string, RadarItem[]> = {};
  for (const it of items) {
    const key = dayKey(it.published_at);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(it);
  }
  const sortedDays = Object.keys(byDate).sort().reverse();

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <header className="x-pagehead">
          <div>
            <h1 className="x-pagehead-title">OPC RADAR</h1>
            <p className="x-pagehead-meta">一人雷达 · 每日扫描 AI × 一人公司创业信号</p>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="radar-empty">
            <p className="radar-empty-title">雷达待机中</p>
            <p className="radar-empty-sub">每日 07:00 扫描</p>
          </div>
        ) : (
          sortedDays.map(key => (
            <section key={key} className="x-date-group">
              <div className="x-date-label">{dayLabel(key)} · {byDate[key].length} 条</div>
              <div className="radar-list">
                {byDate[key].map(it => <RadarCard key={it.id} item={it} />)}
              </div>
            </section>
          ))
        )}

        {rejected.length > 0 && (
          <details className="radar-rejected">
            <summary className="radar-rejected-summary">今日弃选（{rejected.length} 条）· 看看雷达为什么没收录它们</summary>
            <div className="radar-rejected-list">
              {rejected.map(rj => (
                <div key={rj.id} className="radar-rejected-item">
                  <span className="radar-rejected-title">{rj.title}</span>
                  <span className="radar-rejected-reason">{rj.reject_reason}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p style={{ marginBottom: 6 }}><PageViewCounter /></p>
          <p>快讯由 AI 筛选生成，点击标题跳转原始信源。</p>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
