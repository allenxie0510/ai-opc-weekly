import {isAdminPassword,requestHasAdminSession} from '@/lib/admin-session';
import {createServerSupabase} from '@/lib/server-supabase';
import {publishedRadar} from '@/lib/reading/data';
import {validWeek} from '@/lib/reading/model';
import {isUuid} from '@/lib/analytics-server';
import {revalidatePath} from 'next/cache';
export const dynamic='force-dynamic';
const auth=(r:Request)=>isAdminPassword(r.headers.get('x-admin-token'))||requestHasAdminSession(r);
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){if(!auth(request))return Response.json({error:'未授权'},{status:401,headers});const db=createServerSupabase(true);if(!db)return Response.json({error:'服务未配置'},{status:503,headers});const{data,error}=await db.from('news_briefs').select('*').order('slug',{ascending:false}).limit(52);if(error)return Response.json({error:'请先应用P1数据库迁移'},{status:503,headers});return Response.json({briefs:data,items:await publishedRadar()},{headers});}
export async function POST(request:Request){
 if(!auth(request))return Response.json({error:'未授权'},{status:401});
 const raw=await request.text();if(raw.length>16000)return Response.json({error:'请求过大'},{status:413});let b;try{b=JSON.parse(raw);}catch{return Response.json({error:'格式错误'},{status:400});}
 if(!b||!validWeek(b.slug)||typeof b.title!=='string'||!b.title.trim()||b.title.length>180||typeof b.summary!=='string'||b.summary.length>1200||!['draft','published'].includes(b.status)||!Array.isArray(b.item_ids)||!b.item_ids.length||b.item_ids.length>30||!b.item_ids.every(isUuid)||new Set(b.item_ids).size!==b.item_ids.length)return Response.json({error:'需填写有效周一日期、标题并选择1至30条不重复资讯'},{status:400});
 if(b.id&&(!isUuid(b.id)||!Number.isInteger(b.version)))return Response.json({error:'无效版本'},{status:400});
 const items=await publishedRadar(b.item_ids);if(items.length!==b.item_ids.length)return Response.json({error:'部分资讯已下架或不可用，请刷新后重选'},{status:409});
 const db=createServerSupabase(true);if(!db)return Response.json({error:'服务未配置'},{status:503});
 const payload={slug:b.slug,title:b.title.trim(),summary:b.summary.trim(),item_ids:b.item_ids,status:b.status,published_at:b.status==='published'?new Date().toISOString():null};
 const result=b.id?await db.from('news_briefs').update({...payload,version:b.version+1}).eq('id',b.id).eq('slug',b.slug).eq('version',b.version).select('id').maybeSingle():await db.from('news_briefs').insert(payload).select('id').single();
 if(result.error||!result.data)return Response.json({error:result.error?.code==='23505'?'该周已有周报，请编辑已有版本':'保存失败或版本已变化，请刷新重试'},{status:409});
 for(const path of ['/','/archive',`/briefs/${b.slug}`,'/feed.xml'])revalidatePath(path);
 return Response.json({ok:true,id:result.data.id});
}
