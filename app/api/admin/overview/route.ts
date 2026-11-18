import {requestHasAdminSession} from '@/lib/admin-session';
import {createServerSupabase} from '@/lib/server-supabase';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(!requestHasAdminSession(request))return Response.json({error:'请登录后台'},{status:401,headers});
 const db=createServerSupabase(true);if(!db)return Response.json({error:'数据库未配置'},{status:503,headers});
 const states=['pending','filtered','published','rejected','merged'];
 const results=await Promise.all(states.map(state=>db.from('news_queue').select('id',{count:'exact',head:true}).eq('state',state)));
 const briefs=await db.from('news_briefs').select('*').order('slug',{ascending:false}).limit(52);
 if(results.some(r=>r.error)||briefs.error)return Response.json({error:'统计加载失败，请刷新；未知不代表零。'},{status:503,headers});
 return Response.json({counts:Object.fromEntries(states.map((s,i)=>[s,results[i].count])),briefs:briefs.data,checkedAt:new Date().toISOString()},{headers});
}
