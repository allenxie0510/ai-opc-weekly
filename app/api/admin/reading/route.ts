import {isAdminPassword,requestHasAdminSession} from '@/lib/admin-session';
import {createServerSupabase} from '@/lib/server-supabase';
import {analyticsStart} from '@/lib/analytics';
import {readingMetrics,type ReadingEvent,type ReadingFeedback} from '@/lib/reading/metrics';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(!isAdminPassword(request.headers.get('x-admin-token'))&&!requestHasAdminSession(request))return Response.json({error:'未授权'},{status:401,headers});
 const db=createServerSupabase(true);if(!db)return Response.json({error:'统计尚未配置'},{status:503,headers});
 const now=new Date().toISOString(),start=analyticsStart(30),events:ReadingEvent[]=[],feedback:ReadingFeedback[]=[];
 try{
 let cursor=0;
 for(;;){const{data,error}=await db.from('reading_events').select('*').gte('occurred_at',start).lte('occurred_at',now).gt('id',cursor).order('id').limit(1000);if(error)throw error;if(!data?.length)break;events.push(...data);cursor=data[data.length-1].id;if(events.length>50000)throw new Error('range-too-large');}
 // Composite primary-key pagination keeps feedback aggregation complete without 1000-row truncation.
 for(let offset=0;;offset+=1000){const{data,error}=await db.from('reading_feedback').select('*').gte('updated_at',start).lte('updated_at',now).order('visitor_id').order('content_id').range(offset,offset+999);if(error)throw error;if(!data?.length)break;feedback.push(...data);if(feedback.length>50000)throw new Error('range-too-large');}
 return Response.json({start,asOf:now,...readingMetrics(events,feedback)},{headers});
 }catch{return Response.json({error:'统计读取失败，请检查迁移或缩小数据规模；未展示截断结果'},{status:503,headers});}
}
