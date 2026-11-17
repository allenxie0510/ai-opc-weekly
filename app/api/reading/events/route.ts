import { analyticsDay } from '@/lib/analytics';
import { analyticsVisitor,newAnalyticsVisitor,visitorCookie } from '@/lib/analytics-server';
import { requestHasAdminSession } from '@/lib/admin-session';
import { createServerSupabase } from '@/lib/server-supabase';
import { readingItem,publishedBrief } from '@/lib/reading/data';
import { LANES } from '@/lib/reading/model';
import { CHANNELS } from '@/lib/reading/metrics';
export const dynamic='force-dynamic';
const hits=new Map<string,{n:number;until:number}>();
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'Forbidden'},{status:403});
 if(requestHasAdminSession(request)||request.headers.get('dnt')==='1'||request.headers.get('sec-gpc')==='1'||/bot|crawler|spider|headless/i.test(request.headers.get('user-agent')||''))return Response.json({recorded:false});
 const raw=await request.text();if(raw.length>1600)return Response.json({error:'Payload too large'},{status:413});
 let b;try{b=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON'},{status:400});}
 if(!b||!['visit','impression','read','source_click','share','filter','feedback'].includes(b.kind)||typeof b.contentId!=='string'||b.contentId.length>100)return Response.json({error:'Invalid event'},{status:400});
 if(b.kind==='feedback'&&!['useful','neutral','irrelevant'].includes(b.value))return Response.json({error:'Invalid feedback'},{status:400});
 const previous=analyticsVisitor(request),visitor=previous||newAnalyticsVisitor(),now=Date.now();
 if(hits.size>5000)for(const[k,v]of hits)if(v.until<now)hits.delete(k);
 const h=hits.get(visitor);if(h&&h.until>now&&h.n>=90)return Response.json({error:'Too many requests'},{status:429});
 hits.set(visitor,{n:h&&h.until>now?h.n+1:1,until:h&&h.until>now?h.until:now+60000});
 let source='',lane='other';
 if(b.contentId==='feed'){
  if(!['visit','filter'].includes(b.kind))return Response.json({error:'Invalid target'},{status:400});
  lane=typeof b.lane==='string'&&b.lane in LANES?b.lane:'other';
 }else if(b.contentId.startsWith('brief-')){
  if(!['visit','share'].includes(b.kind)||!await publishedBrief(b.contentId.slice(6)))return Response.json({error:'Not found'},{status:404});
  source='周报';
 }else{
  const item=await readingItem(b.contentId);if(!item)return Response.json({error:'Not found'},{status:404});
  source=item.source;lane=item.lane;
 }
 const db=createServerSupabase(true);if(!db)return Response.json({error:'暂时无法记录'},{status:503});
 const channel=CHANNELS.includes(b.channel)?b.channel:'direct';
 const result=b.kind==='feedback'?await db.from('reading_feedback').upsert({visitor_id:visitor,content_id:b.contentId,source,lane,value:b.value,updated_at:new Date().toISOString()},{onConflict:'visitor_id,content_id'}):await db.from('reading_events').upsert({visitor_id:visitor,kind:b.kind,content_id:b.contentId,source,lane,channel,dedupe_key:`${visitor}:${b.kind}:${b.contentId}:${analyticsDay()}:${b.kind==='filter'?lane:''}`},{onConflict:'dedupe_key',ignoreDuplicates:true});
 if(result.error)return Response.json({error:'暂时无法记录，请稍后重试'},{status:503});
 return Response.json({recorded:true},{headers:previous?{}:{'Set-Cookie':visitorCookie(visitor)}});
}
