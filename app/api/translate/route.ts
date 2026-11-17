import { createServerSupabase } from '@/lib/server-supabase';
import { translateTweet } from '@/lib/reading/translate';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const pending = new Map<string, Promise<string>>();
let budget = {start:0, count:0};

export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin || req.headers.get('sec-fetch-site') === 'cross-site') return Response.json({error:'Forbidden'}, {status:403});
  const body = await req.json().catch(()=>null);
  if (!/^\d{1,25}$/.test(body?.tweet_id || '')) return Response.json({error:'动态编号无效'}, {status:400});
  const db = createServerSupabase(true);
  if (!db) return Response.json({error:'翻译暂不可用'}, {status:503});
  // Never trust client-provided text or let callers overwrite another tweet's cache.
  const {data:tweet,error} = await db.from('tweets').select('content,translated_text,author_username').eq('tweet_id',body.tweet_id).maybeSingle();
  if (error) return Response.json({error:'翻译暂不可用'}, {status:503});
  if (!tweet) return Response.json({error:'动态不存在'}, {status:404});
  const {data:account} = await db.from('twitter_accounts').select('id').eq('username',tweet.author_username).eq('enabled',true).maybeSingle();
  if (!account) return Response.json({error:'动态不可用'}, {status:404});
  if (tweet.translated_text) return Response.json({translated_text:tweet.translated_text,cached:true});
  if (!tweet.content?.trim() || tweet.content.length > 12000) return Response.json({error:'请查看原文'}, {status:422});
  let task = pending.get(body.tweet_id);
  if (!task) {
    if (Date.now()-budget.start > 60000) budget = {start:Date.now(),count:0};
    if (pending.size >= 3 || budget.count >= 30) return Response.json({error:'翻译繁忙，请稍后重试'}, {status:429,headers:{'Retry-After':'15'}});
    budget.count++;
    task = (async()=>{
      const translated = await translateTweet(tweet.content);
      const {error:writeError} = await db.from('tweets').update({translated_text:translated}).eq('tweet_id',body.tweet_id).eq('content',tweet.content);
      if (writeError) throw new Error('Translation cache unavailable');
      return translated;
    })();
    pending.set(body.tweet_id,task);
  }
  try { return Response.json({translated_text:await task,cached:false}); }
  catch { return Response.json({error:'暂时无法翻译，请重试或查看原文'}, {status:503}); }
  finally { if (pending.get(body.tweet_id)===task) pending.delete(body.tweet_id); }
}
