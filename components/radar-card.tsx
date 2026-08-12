import { CATEGORY_MAP } from '@/lib/types';
import type { RadarItem } from '@/lib/types';
import { AdminEditButton } from '@/components/admin-edit';
import { RadarCover } from '@/components/radar-cover';

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

export function RadarCard({ item }: { item: RadarItem }) {
  const cat = item.category ? CATEGORY_MAP[item.category] : null;
  const hasScore = Number.isFinite(item.score) && item.score > 0;
  return (
    <article className="radar-card">
      <AdminEditButton
        type="radar"
        id={item.id}
        initial={{
          title: item.title,
          summary: item.summary || '',
          editor_note: item.editor_note || '',
          pick_reason: item.pick_reason || '',
          category: item.category || 'indie-tool',
          score: item.score,
        }}
      />
      {item.image_url && <RadarCover src={item.image_url} alt={item.title} />}
      <div className="radar-card-body">
        {/* P0 标签瘦身：只保留收录理由一个胶囊（低饱和）；分类并入来源行纯文字 */}
        <div className="radar-card-top">
          {item.pick_reason && <span className="radar-pick">{item.pick_reason}</span>}
          <span className="radar-meta">
            {item.source_name}
            {cat && <><span className="radar-meta-sep">·</span>{cat.label}</>}
            <span className="radar-meta-sep">·</span>
            <time>{timeAgo(item.published_at)}</time>
          </span>
        </div>

        <div className="radar-title-row">
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="radar-title">
            {item.title}
          </a>
          {hasScore && <span className="radar-title-score">{item.score}分</span>}
        </div>

        {item.summary && <p className="radar-summary">{item.summary}</p>}

        {item.editor_note && (
          <blockquote className="radar-editor-note">
            <span className="radar-editor-label">编辑点评</span>
            {item.editor_note}
          </blockquote>
        )}
      </div>
    </article>
  );
}
