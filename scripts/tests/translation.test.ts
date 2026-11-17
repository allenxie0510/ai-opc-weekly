import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../../app/api/translate/route';

test('translation authenticates source records, ignores submitted text, caches Chinese, and restricts cross-site requests',async()=>{
 const fetchBefore=global.fetch;const envBefore={...process.env};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.example.com';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';process.env.DEEPSEEK_API_KEY='test-model-key';
 let modelCalls=0,cache='',enabled=true,modelText='';
 global.fetch=async(input,init)=>{
  const url=String(input);const requestBody=init?.body?JSON.parse(String(init.body)):null;
  if(url.includes('api.deepseek.com')){modelCalls++;modelText=requestBody.messages[1].content;return Response.json({choices:[{finish_reason:'stop',message:{content:'新的工具已经发布。'}}]});}
  if(url.includes('twitter_accounts'))return Response.json(enabled?{id:'tracked'}:null);
  if(init?.method==='PATCH'){cache=requestBody.translated_text;return new Response(null,{status:204});}
  return Response.json({content:'New tools are available.',translated_text:cache,author_username:'tracked'});
 };
 const request=(origin='https://example.com')=>new Request('https://example.com/api/translate',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({tweet_id:'123',text:'Forged text supplied by client'})});
 try{
  assert.equal((await POST(request('https://attacker.example'))).status,403);
  const first=await POST(request());assert.equal(first.status,200);assert.equal((await first.json()).translated_text,'新的工具已经发布。');assert.equal(modelText,'New tools are available.');assert.equal(cache,'新的工具已经发布。');
  assert.equal((await (await POST(request())).json()).cached,true);assert.equal(modelCalls,1);
  enabled=false;assert.equal((await POST(request())).status,404);
 }finally{global.fetch=fetchBefore;process.env=envBefore;}
});
