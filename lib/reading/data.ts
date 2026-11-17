import 'server-only';
import { createServerSupabase } from '../server-supabase';
import { getTweets, getTwitterAccounts } from '../data';
import type { RadarItem } from '../types';
import { radarItem, tweetItem, mergeReading, type Brief, type ReadingItem } from './model';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function publishedRadar(ids?: string[]): Promise<ReadingItem[]> {
  const db = createServerSupabase(true) || createServerSupabase();
  if (!db || (ids && !ids.length)) return [];
  let query = db.from('radar_items').select('*,news_queue!inner(state)').eq('status','published').eq('news_queue.state','published').order('published_at',{ascending:false});
  if (ids) query = query.in('id',ids); else query = query.limit(200);
  const { data, error } = await query;
  if (error) { console.error('Reading feed unavailable',error.code); return []; }
  const rows = (data || []) as RadarItem[];
  // Only whitelisted public metadata, never bodies, draft records or editorial logs.
  const { data: meta } = rows.length ? await db.from('news_queue').select('radar_id,draft,news_documents(article)').eq('state','published').in('radar_id',rows.map(r=>r.id)) : { data: [] };
  const byId = new Map((meta||[]).map(m => { const doc = m.news_documents as unknown as {article?: {publishedAt?: string; imageUrl?:string}}; return [m.radar_id,{lane:m.draft?.lane,sourcePublishedAt:doc?.article?.publishedAt,imageUrl:doc?.article?.imageUrl,scores:[m.draft?.importance,m.draft?.usefulness,m.draft?.evidence]}]; }));
  return rows.map(r => radarItem(r,byId.get(r.id)));
}
export async function readingFeed(includeX = false) {
  const radar = await publishedRadar();
  if (!includeX) return mergeReading(radar);
  const accounts = await getTwitterAccounts();
  const tweets = await getTweets({limit:100,authors:accounts.map(a=>a.username)});
  return mergeReading([...radar,...tweets.map(tweetItem)]);
}
export async function readingItem(id: string): Promise<ReadingItem|null> {
  if (id.startsWith('r-') && uuid.test(id.slice(2))) return (await publishedRadar([id.slice(2)]))[0] || null;
  if (!/^x-\d{1,25}$/.test(id)) return null;
  const db = createServerSupabase(true) || createServerSupabase(); if (!db) return null;
  const {data} = await db.from('tweets').select('*').eq('tweet_id',id.slice(2)).maybeSingle();
  if (!data) return null;
  const {data:account} = await db.from('twitter_accounts').select('id').eq('username',data.author_username).eq('enabled',true).maybeSingle();
  return account ? tweetItem(data) : null;
}
export async function publishedBriefs(): Promise<Brief[]> {
  const db=createServerSupabase(true) || createServerSupabase(); if(!db)return [];
  const {data,error}=await db.from('news_briefs').select('*').eq('status','published').order('slug',{ascending:false}).limit(52);
  if(error) { console.error('Briefs unavailable',error.code); return []; } return data||[];
}
export async function publishedBrief(slug: string): Promise<{brief:Brief;items:ReadingItem[]}|null> {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(slug))return null;
  const db=createServerSupabase(true) || createServerSupabase();if(!db)return null;
  const {data:brief}=await db.from('news_briefs').select('*').eq('slug',slug).eq('status','published').maybeSingle();
  if(!brief)return null;
  const items=await publishedRadar(brief.item_ids); const byId=new Map(items.map(i=>[i.id.slice(2),i]));
  return {brief,items:brief.item_ids.flatMap((id:string)=>byId.has(id)?[byId.get(id)!]:[])};
}
