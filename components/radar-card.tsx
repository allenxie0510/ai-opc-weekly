import { CATEGORY_MAP } from '@/lib/types';
import type { RadarItem } from '@/lib/types';

export function timeAgo(dateStr: string): string {
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
export function dayKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function dayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

function scoreClass(score: number): string {
  if (score >= 80) return 'radar-score high';
  if (score >= 60) return 'radar-score mid';
  return 'radar-score';
}

export function RadarCard({ item }: { item: RadarItem }) {
  const cat = item.category ? CATEGORY_MAP[item.category] : null;
  return (
    <article className="radar-card">
      <div className="radar-card-top">
        {cat && <span className={`art-cat-pill ${cat.cssClass}`}>{cat.label}</span>}
        {item.pick_reason && <span className="radar-pick">{item.pick_reason}</span>}
        <span className="radar-meta">
          {item.source_name}
          <span className="radar-meta-sep">·</span>
          <time>{timeAgo(item.published_at)}</time>
        </span>
        <span className={scoreClass(item.score)}>{item.score}</span>
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
