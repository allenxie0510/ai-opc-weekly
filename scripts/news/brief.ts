import {createClient} from '@supabase/supabase-js';
import {weekStart} from '../../lib/reading/model';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Brief generation requires server configuration');
const db=createClient(url,key);
async function main(){
 const week=weekStart(new Date(Date.now()-7*86400000).toISOString()),start=new Date(week+'T00:00:00+08:00'),end=new Date(start.getTime()+7*86400000);
 const{data,error}=await db.from('radar_items').select('id,title,source_name,news_queue!inner(state)').eq('status','published').eq('news_queue.state','published').gte('published_at',start.toISOString()).lt('published_at',end.toISOString()).order('published_at',{ascending:false}).limit(30);if(error)throw error;
 if(!data?.length){console.log('No published items this week; no filler brief created.');return;}
 const{error:writeError}=await db.from('news_briefs').upsert({slug:week,title:`本周值得关注的新变化 · ${week}`,summary:'本期汇集已审核资讯，按自己的工作需求选择阅读。',item_ids:data.map(i=>i.id),status:'draft'},{onConflict:'slug',ignoreDuplicates:true});if(writeError)throw writeError;console.log(`Weekly draft ${week}: ${data.length} published references; existing briefs preserved. Never auto-published.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
