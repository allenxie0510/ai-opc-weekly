import test from 'node:test';
import assert from 'node:assert/strict';
import {GET,POST} from '../../app/api/admin/news/route';

test('anonymous users cannot edit or remove curated content',async()=>{
 const response=await POST(new Request('https://example.test/api/admin/news',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete'})}));
 assert.equal(response.status,401);
});
test('management rejects old manual-approval operations',async()=>{
 const saved=process.env.ADMIN_PASSWORD;process.env.ADMIN_PASSWORD='test-password';const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
 try{for(const action of ['publish','restore','save']){const response=await POST(new Request('https://example.test/api/admin/news',{method:'POST',headers:{'x-admin-token':'test-password','Content-Type':'application/json'},body:JSON.stringify({id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',version:1,action})}));assert.equal(response.status,400);}}
 finally{for(const[k,v]of Object.entries({ADMIN_PASSWORD:saved,NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});


test('admin searches beyond first 100 records with exact totals and literal wildcard matching',async()=>{
 const originalFetch=globalThis.fetch;
 const saved={ADMIN_PASSWORD:process.env.ADMIN_PASSWORD,NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
 Object.assign(process.env,{ADMIN_PASSWORD:'test-password',NEXT_PUBLIC_SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-key'});
 const requests:URL[]=[];
 globalThis.fetch=async(input)=>{const url=new URL(String(input));requests.push(url);return new Response(JSON.stringify(url.pathname.endsWith('/news_queue')?[{id:'older-item'}]:[]),{headers:{'Content-Type':'application/json','Content-Range':'100-100/101'}});};
 try{
  const params=new URLSearchParams({state:'published',page:'5',q:'API 50%_'});
  const response=await GET(new Request(`https://example.test/api/admin/news?${params}`,{headers:{'x-admin-token':'test-password'}}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,101);assert.equal(data.page,5);assert.equal(data.queue[0].id,'older-item');
  const queue=requests.find(u=>u.pathname.endsWith('/news_queue'))!;
  assert.equal(queue.searchParams.get('offset'),'100');assert.equal(queue.searchParams.get('limit'),'25');
  assert.equal(queue.searchParams.get('draft->>title'),'ilike.%API 50\\%\\_%');
  assert.equal(queue.searchParams.get('order'),'created_at.desc,id.desc');
 }finally{globalThis.fetch=originalFetch;for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
