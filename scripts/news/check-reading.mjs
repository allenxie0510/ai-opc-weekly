import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Missing server configuration');
const db=createClient(url,key,{auth:{persistSession:false}});
for(const table of ['news_briefs','reading_events','reading_feedback']){
 const {count,error}=await db.from(table).select('*',{count:'exact',head:true});
 assert.ifError(error);console.log(`${table}: accessible to server; ${count} records`);
}
const {data,error}=await db.from('radar_items').select('id,news_queue!inner(state,draft,news_documents(article))').eq('status','published').eq('news_queue.state','published').limit(200);
assert.ifError(error);
for(const row of data){assert.ok(row.news_queue.length);assert.ok(row.news_queue.every(q=>q.state==='published'&&q.draft&&q.news_documents?.article));}
console.log(`New editorial join verified: ${data.length} published items; legacy records excluded.`);
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(anon){const publicDb=createClient(url,anon,{auth:{persistSession:false}});for(const table of ['news_briefs','reading_events','reading_feedback']){const r=await publicDb.from(table).select('*').limit(1);assert.ok(r.error,`${table} must deny anonymous reads`);}console.log('Anonymous access denied for all three private tables.');}
console.log('Read-only P1 integration checks passed. No content or metrics changed.');
