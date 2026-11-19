import {createClient} from '@supabase/supabase-js';
import {newsModelConfig,requestModel} from '../../lib/news/model-request';
import {CHIEF_EDITOR_PROMPT,publicationBlocks,type EditorialVerdict} from '../../lib/news/chief-editor';
import type {Article,Draft,Source} from '../../lib/news/types';
import {mkdir,writeFile} from 'node:fs/promises';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const model=newsModelConfig(process.env);
const outcomes:{id:string;outcome:string;reason:string}[]=[];
async function main(){
 const {data,error}=await db.from('news_queue').select('id,version,draft,source_id,event_key,news_documents(article),news_sources(definition)').eq('state','pending').order('created_at',{ascending:false}).limit(60);
 if(error)throw error;
 const {data:removed,error:removedError}=await db.from('news_queue').select('event_key,news_documents(url)').eq('state','rejected');
 if(removedError)throw removedError;
 const suppressedEvents=new Set((removed||[]).map(r=>r.event_key));
 const suppressedUrls=new Set((removed||[]).map(r=>(r.news_documents as unknown as {url:string}).url));
 let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{
  while(cursor<(data||[]).length){
   const row=data![cursor++];const article=(row.news_documents as unknown as {article:Article}).article;const source=(row.news_sources as unknown as {definition:Source}).definition;const draft=row.draft as Draft;
   try{
    let blocks=publicationBlocks(article,draft,source);if(suppressedEvents.has(row.event_key)||suppressedUrls.has(article.url))blocks.push('管理员已删除此内容，禁止自动重新推荐');let verdict:EditorialVerdict|undefined;
    const {data:duplicate,error:duplicateError}=await db.from('news_queue').select('id').eq('event_key',row.event_key).eq('state','published').limit(1);
    if(duplicateError)throw duplicateError;if(duplicate?.length)blocks.push('同一事件已有精选报道');
    if(!blocks.length){
     const response=await requestModel(()=>fetch(model.endpoint,{method:'POST',signal:AbortSignal.timeout(90000),headers:{Authorization:`Bearer ${model.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:model.model,temperature:.1,max_tokens:1800,thinking:{type:'disabled'},response_format:{type:'json_object'},messages:[{role:'system',content:CHIEF_EDITOR_PROMPT},{role:'user',content:JSON.stringify({source:source.name,tier:source.tier,note:source.note,publishedAt:article.publishedAt,body:article.body.slice(0,30000),draft})}]})}));
     const payload=await response.json();if(payload.choices?.[0]?.finish_reason==='length')throw Error('总编输出截断');
     verdict=JSON.parse(payload.choices?.[0]?.message?.content||'null');
     if(!verdict||typeof verdict!=='object')throw Error('总编裁决不可用');
     blocks=publicationBlocks(article,draft,source,verdict);
    }
    if(blocks.length){
     // Conditional state/version keeps a concurrent administrator change authoritative.
     const {data:updated,error:updateError}=await db.from('news_queue').update({state:'filtered',reasons:blocks,version:row.version+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('version',row.version).eq('state','pending').select('id');
     if(updateError)throw updateError;
     outcomes.push({id:row.id,outcome:updated?.length?'filtered':'conflict',reason:blocks.join('；')});
    }else{
     const reason=`总编Agent复核通过：${verdict!.reason}；读者价值：${verdict!.readerValue}`.slice(0,1000);
     const {error:publishError}=await db.rpc('review_news',{p_id:row.id,p_version:row.version,p_action:'publish',p_draft:draft,p_reason:reason,p_confirmed:true,p_target:null});
     if(publishError)throw publishError;
     outcomes.push({id:row.id,outcome:'published',reason});
    }
   }catch(e){outcomes.push({id:row.id,outcome:'error',reason:String(e)});}
   console.log(`${outcomes.at(-1)?.outcome}: ${row.id}`);
  }
 }));
 await mkdir('output/news-audit',{recursive:true});await writeFile('output/news-audit/chief-editor.json',JSON.stringify({at:new Date().toISOString(),model:model.model,outcomes},null,2));
 console.log(JSON.stringify({published:outcomes.filter(o=>o.outcome==='published').length,filtered:outcomes.filter(o=>o.outcome==='filtered').length,errors:outcomes.filter(o=>o.outcome==='error').length}));
 if(outcomes.some(o=>o.outcome==='error'))process.exitCode=1;
}
main().catch(e=>{console.error(String(e));process.exitCode=1});
