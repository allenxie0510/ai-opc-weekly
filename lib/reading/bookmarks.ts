import type { ReadingItem } from './model';
export const BOOKMARK_KEY='aiopc_reading_bookmarks_v1';
export function parseBookmarks(raw:string|null):ReadingItem[]{
 try {const data=JSON.parse(raw||'[]');if(!Array.isArray(data))return [];const seen=new Set<string>();return data.filter(i=>i&&typeof i.id==='string'&&/^(r-[a-f0-9-]{36}|x-\d{1,25})$/i.test(i.id)&&typeof i.title==='string'&&typeof i.summary==='string'&&!seen.has(i.id)&&!!seen.add(i.id)).slice(0,500);}catch{return [];}
}
