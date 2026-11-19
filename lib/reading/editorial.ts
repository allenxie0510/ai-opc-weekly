import type { ReadingItem } from './model';

export const TOPICS = [
  { id: 'industry', number: '01', title: '看懂行业', description: '模型、平台与规则，哪些变化与你有关。' },
  { id: 'tools', number: '02', title: '改进工作', description: '把新能力用到创作、开发与交付中。' },
  { id: 'business', number: '03', title: '做好经营', description: '获客、定价与订阅，关注可核对的经验。' },
] as const;

/** Only rank published selections; prefer useful recent coverage over source fame. */
export function editorialPicks(items: ReadingItem[], now = Date.now()) {
  const recent = items.filter(i => i.reviewed && (i.score || 0) >= 67 && Date.parse(i.sourcePublishedAt || i.publishedAt) <= now && now - Date.parse(i.sourcePublishedAt || i.publishedAt) <= 7 * 86400000);
  const ranked = [...recent].sort((a, b) => (b.score || 0) - (a.score || 0) || b.publishedAt.localeCompare(a.publishedAt));
  const picks: ReadingItem[] = [];
  for (const topic of TOPICS) {
    const item = ranked.find(i => i.lane === topic.id && !picks.some(p => p.source === i.source)) || ranked.find(i => i.lane === topic.id && !picks.some(p => p.id === i.id));
    if (item) picks.push(item);
  }
  return picks;
}
export function searchReading(items: ReadingItem[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  return items.filter(i => words.every(w => `${i.title} ${i.summary} ${i.relevance} ${i.source}`.toLocaleLowerCase().includes(w)));
}
export function readingMinutes(items: ReadingItem[]) {
  return Math.max(1, Math.ceil(items.reduce((sum, i) => sum + i.title.length + i.summary.length + i.relevance.length, 0) / 450));
}

/** A focus is a stronger presentation of an already recommended item, never raw source material. */
export function focusStory(items:ReadingItem[], now=Date.now()):ReadingItem|undefined {
 return items.filter(i=>i.reviewed&&(i.score??0)>=67&&Number.isFinite(Date.parse(i.sourcePublishedAt||i.publishedAt))&&Date.parse(i.sourcePublishedAt||i.publishedAt)<=now&&now-Date.parse(i.sourcePublishedAt||i.publishedAt)<=7*86400000)
  .sort((a,b)=>(b.score??0)-(a.score??0)||(b.sourcePublishedAt||b.publishedAt).localeCompare(a.sourcePublishedAt||a.publishedAt)||a.id.localeCompare(b.id))[0];
}
