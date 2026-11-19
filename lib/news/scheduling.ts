import type { Article, Source, Lane } from './types';
export type Candidate = { article: Article; source: Source; id: string };
/** Round-robin source coverage prevents array order from consuming the review budget. */
export function scheduleCandidates(candidates: Candidate[], limits: Record<Lane,number>, perSource: number) {
  const buckets = new Map<string,Candidate[]>();
  for (const candidate of candidates) {
    const bucket = buckets.get(candidate.source.id) || [];
    bucket.push(candidate); buckets.set(candidate.source.id,bucket);
  }
  for (const bucket of buckets.values()) bucket.sort((a,b)=>(b.article.publishedAt||'').localeCompare(a.article.publishedAt||''));
  const used: Record<Lane,number> = {industry:0,tools:0,business:0};
  const selected: Candidate[] = [];
  for (let round=0;round<perSource;round++) for (const bucket of buckets.values()) {
    const item=bucket[round];
    if (item && used[item.source.lane] < limits[item.source.lane]) {selected.push(item);used[item.source.lane]++;}
  }
  return selected;
}
