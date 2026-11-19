import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../../app/api/admin/news/route';

test('anonymous users cannot edit or remove curated content',async()=>{
 const response=await POST(new Request('https://example.test/api/admin/news',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete'})}));
 assert.equal(response.status,401);
});
test('management rejects old manual-approval operations',async()=>{
 const saved=process.env.ADMIN_PASSWORD;process.env.ADMIN_PASSWORD='test-password';const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
 try{for(const action of ['publish','restore','save']){const response=await POST(new Request('https://example.test/api/admin/news',{method:'POST',headers:{'x-admin-token':'test-password','Content-Type':'application/json'},body:JSON.stringify({id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',version:1,action})}));assert.equal(response.status,400);}}
 finally{for(const[k,v]of Object.entries({ADMIN_PASSWORD:saved,NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
