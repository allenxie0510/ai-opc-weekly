export type ReadingEvent = { kind: string; visitor_id: string; content_id: string; source: string; lane: string; channel: string; occurred_at: string };
export type ReadingFeedback = { visitor_id: string; content_id: string; source: string; lane: string; value: string; updated_at: string };
export const CHANNELS = ['direct','wechat','share','rss','weekly'];
export function readingMetrics(events: ReadingEvent[], feedback: ReadingFeedback[]) {
  const visits=events.filter(e=>e.kind==='visit');
  const days=new Map<string,Set<string>>();
  for(const e of visits) { const day=new Date(Date.parse(e.occurred_at)+8*3600000).toISOString().slice(0,10); const set=days.get(e.visitor_id)||new Set();set.add(day);days.set(e.visitor_id,set); }
  const pair=(e:ReadingEvent)=>`${e.visitor_id}:${e.content_id}`;
  const clicks=new Set(events.filter(e=>e.kind==='source_click').map(pair));
  const exposed=new Set(events.filter(e=>['impression','read'].includes(e.kind)).map(pair));
  const dimensions=(key:'source'|'lane'|'channel')=>[...new Set([...events.map(e=>e[key]),...(key==='channel'?[]:feedback.map(f=>f[key]))].filter(Boolean))].map(label=>{
    const rows=events.filter(e=>e[key]===label); const f=feedback.filter(f=>key!=='channel' && f[key]===label);
    return {label,views:new Set(rows.filter(e=>['impression','read'].includes(e.kind)).map(pair)).size,clicks:new Set(rows.filter(e=>e.kind==='source_click').map(pair)).size,visitors:new Set(rows.filter(e=>e.kind==='visit').map(e=>e.visitor_id)).size,useful:f.filter(f=>f.value==='useful').length,irrelevant:f.filter(f=>f.value==='irrelevant').length};
  }).sort((a,b)=>b.clicks-a.clicks||b.views-a.views);
  return {visitors:days.size,returning:[...days.values()].filter(d=>d.size>1).length,views:exposed.size,sourceClicks:clicks.size,shares:events.filter(e=>e.kind==='share').length,feedback:{useful:feedback.filter(f=>f.value==='useful').length,neutral:feedback.filter(f=>f.value==='neutral').length,irrelevant:feedback.filter(f=>f.value==='irrelevant').length},sources:dimensions('source'),lanes:dimensions('lane'),channels:dimensions('channel')};
}
