import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWeeklyCandidates, weeklyScore, portfolioAllows } from '../lib/weekly-research-policy.mjs';
import { publicAddress, extractSourceText } from '../lib/weekly-source-reader.mjs';
import { runWeeklyResearch, weekIdentity } from '../generate-weekly-research.mjs';
import { validateReportPayload } from '../lib/weekly-report-generator.mjs';
import { reportPayload, testMaterial } from './helpers/weekly-report-fixture.mjs';
const now=Date.now();
const row=(id,source='创始人')=>({title:`Studio${id} AI customer design`,source_url:`https://studio${id}.com`,source_name:source,snippet:'AI generates product images for paying customers and customer design orders.',published_at:new Date(now-86400000).toISOString()});
test('weekly pool accepts unknown geography, ignores daily caps and filters stale/background material',()=>{
 const rows=Array.from({length:20},(_,i)=>row(i,i%2?'经营案例':'新品来源'));
 assert.equal(selectWeeklyCandidates(rows,new Set(),now).length,20);
 assert.equal(selectWeeklyCandidates([{...row(1),published_at:new Date(now-91*86400000).toISOString()}, {...row(2),source_name:'TechCrunch'}],new Set(),now).length,0);
 assert.equal(selectWeeklyCandidates(rows,new Set(['https://studio1.com']),now).length,19);
});
test('portfolio enforces product, source and category diversity',()=>{
 const item={title:'StudioFox：图像交付',category:'design-assets',refs:[{url:'https://source.com/a'}]};
 assert.equal(portfolioAllows(item,[item]),false);
 assert.equal(portfolioAllows(item,[{...item,title:'OtherOne',refs:[{url:'https://source.com/b'}]},{...item,title:'OtherTwo',refs:[{url:'https://source.com/c'}]}]),false);
 assert.equal(weeklyScore({customer:4,business:4,solo:4,evidence:4,learning:4}),80);
 assert.throws(()=>weeklyScore({customer:7}));
});
test('safe source reading rejects private addresses and strips executable/navigation text',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','100.64.0.1','224.0.0.1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('1.1.1.1'),true);
 assert.equal(extractSourceText('<nav>ignore</nav><article>AI design <script>steal()</script>customers</article>'),'AI design customers');
});
test('full report requires actual quotes, distinct facts and all analytical sections',()=>{
 const raw=reportPayload();
 const result=validateReportPayload(raw,testMaterial,'test-model');
 assert.equal(result.ok,true,result.reason);
 assert.equal(result.item.editorial_brief.weekly_report.score,80);
 const invented=reportPayload();invented.report.facts[0].quote='Invented paying customer evidence';
 assert.equal(validateReportPayload(invented,testMaterial,'test').reason,'ungrounded-report-fact');
 const missing=reportPayload();missing.report.analysis.economics='';
 assert.equal(validateReportPayload(missing,testMaterial,'test').reason,'missing-economics');
 const unknown=reportPayload();unknown.article.editorial_brief.operating_market='unknown';unknown.article.editorial_brief.market_quote='';
 assert.equal(validateReportPayload(unknown,testMaterial,'test').ok,true);
});
test('ISO week identity has no local timezone or New Year drift',()=>{
 assert.equal(weekIdentity(new Date('2026-09-14T04:00:00Z')).week_start,'2026-09-14');
 assert.equal(weekIdentity(new Date('2027-01-01T00:00:00Z')).slug,'2026-w53');
});
async function pipeline(count){
 const writes=[];let created=false;
 const db=async(path,opts={})=>{
  if(opts.method){writes.push({path,...opts,body:JSON.parse(opts.body)});if(path==='/weekly_issues')created=true;return [];}
  if(path.includes('weekly_issues'))return created?[{id:'issue',status:'draft',issue_number:1}]:[];
  if(path.includes('radar_candidates'))return Array.from({length:count},(_,i)=>row(i));
  return [];
 };
 const generate=async material=>{const checked=validateReportPayload(reportPayload(),testMaterial,'test');checked.item.title=material.title;checked.item.refs=[{url:material.source_url,label:'source'}];checked.item.category=['automation','design-assets','content-monetize'][Number(material.title.match(/Studio(\d+)/)[1])%3];return checked;};
 let error,result;try{result=await runWeeklyResearch({db,read:async r=>r,generate});}catch(e){error=e;}
 return {writes,result,error};
}
test('six reports persist individually; partial delivery preserves rows and signals shortfall',async()=>{
 const success=await pipeline(6);assert.equal(success.error,undefined);assert.equal(success.result.total,6);assert.equal(success.result.reports,6);
 assert.equal(success.writes.filter(w=>w.path==='/news_items').length,6);
 assert.ok(!success.writes.some(w=>w.method==='DELETE'));
 const partial=await pipeline(3);assert.match(partial.error.message,/尚未达交付线/);assert.equal(partial.writes.filter(w=>w.path==='/news_items').length,3);
});
test('published issue is not regenerated or written',async()=>{
 let reads=0;
 await runWeeklyResearch({db:async()=>{reads++;return[{status:'published'}]},generate:async()=>{throw new Error('must not generate')}});
 assert.equal(reads,1);
});

test('publication requires five to six complete reports, including every batch member',async()=>{
 const {weeklyDeliveryReady}=await import('../../lib/weekly-report.mjs');
 const item=validateReportPayload(reportPayload(),testMaterial,'test').item;
 assert.equal(weeklyDeliveryReady([item]),false);
 assert.equal(weeklyDeliveryReady(Array(5).fill(item)),true);
 assert.equal(weeklyDeliveryReady(Array(6).fill(item)),true);
 assert.equal(weeklyDeliveryReady(Array(7).fill(item)),false);
 assert.equal(weeklyDeliveryReady([...Array(4).fill(item),{editorial_brief:{}}]),false);
});

test('quality rejections cool down for seven days; model/network failures stay retryable',async()=>{
 const {reviewKey,recentlyRejected,cacheableRejection}=await import('../lib/weekly-review-cache.mjs');
 const material=row(1),state={[reviewKey(material)]:now};
 assert.equal(recentlyRejected(material,state,now+60000),true);
 assert.equal(recentlyRejected({...material,snippet:'updated public evidence'},state,now),false);
 assert.equal(recentlyRejected(material,state,now+8*86400000),false);
 assert.equal(cacheableRejection('editorial-reject'),true);
 assert.equal(cacheableRejection('model-rate-limited'),false);
 assert.equal(cacheableRejection('ungrounded-report-fact'),false);
});
