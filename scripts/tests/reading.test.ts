import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {filterReading,mergeReading,weekStart,validWeek,sharePath,safeHttp,radarItem,tweetItem,type ReadingItem} from '../../lib/reading/model';
import {readingMetrics,type ReadingEvent} from '../../lib/reading/metrics';
import type {RadarItem,Tweet} from '../../lib/types';
const item:ReadingItem={id:'r-a',kind:'radar',title:'工具更新',summary:'事实',relevance:'开发者交付变化',source:'Official',sourceUrl:'https://example.com/release',lane:'tools',publishedAt:'2026-11-17T10:00:00Z',sourcePublishedAt:null,reviewed:true};
test('default feed never recommends X source material; filters remain independent',()=>{
 const x={...item,id:'x-1',kind:'x' as const,reviewed:false,sourceUrl:'https://x.com/a/status/1',source:'X · @a'};
 assert.deepEqual(filterReading([item,x],{}),[item]);
 assert.deepEqual(filterReading([item,x],{view:'all',source:'x'}),[x]);
 assert.equal(filterReading([item,x],{view:'all',lane:'business'}).length,0);
 assert.deepEqual(filterReading([item,x],{view:'all',source:'Official'}),[item]);
});
test('a reviewed canonical story wins over newer unreviewed duplicate and input remains unchanged',()=>{
 const x={...item,id:'x-2',kind:'x' as const,reviewed:false,sourceUrl:item.sourceUrl+'?utm_source=x',publishedAt:'2026-11-18T10:00:00Z'};
 const input=[x,item];assert.deepEqual(mergeReading(input),[item]);assert.equal(input[0],x);
 assert.equal(mergeReading([item,{...item,id:'r-b',sourceUrl:item.sourceUrl+'?id=2'}]).length,2);
});
test('source times are distinct from collection time and original URL schemes are restricted',()=>{
 const r=radarItem({id:'a',title:'标题',summary:'摘要',editor_note:'判断',source_name:'官方',source_url:'javascript:alert(1)',pick_reason:'看懂行业',published_at:'2026-11-17',category:'other'} as RadarItem,{sourcePublishedAt:'2026-11-01'});
 assert.equal(r.sourceUrl,'');assert.equal(r.sourcePublishedAt,'2026-11-01');assert.equal(r.lane,'industry');
 assert.equal(safeHttp('https://user:pass@example.com'),null);
 const t=tweetItem({tweet_id:'123',author_username:'author',content:'原话',url:'https://x.com/author/status/123',published_at:'2026-11-02'} as Tweet);assert.equal(t.reviewed,false);assert.equal(t.id,'x-123');
});
test('weekly windows follow Shanghai Mondays across year boundaries; QR/share paths target a stable specific page',()=>{
 assert.equal(weekStart('2026-11-15T15:59:00Z'),'2026-11-09');assert.equal(weekStart('2026-11-15T16:00:00Z'),'2026-11-16');
 assert.equal(weekStart('2027-01-01T12:00:00Z'),'2026-12-28');assert.equal(validWeek('2026-11-16'),true);assert.equal(validWeek('2026-11-17'),false);assert.equal(validWeek('2026-02-30'),false);
 assert.equal(sharePath('briefs','2026-11-16','wechat'),'/briefs/2026-11-16?from=wechat');assert.equal(sharePath('news','r-abc'),'/news/r-abc?from=share');
});
test('metrics count cross-day browser revisits and deduplicate content exposures/clicks',()=>{
 const e:ReadingEvent={kind:'visit',visitor_id:'a',content_id:'feed',source:'',lane:'other',channel:'wechat',occurred_at:'2026-11-16T14:00:00Z'};
 const result=readingMetrics([e,{...e,occurred_at:'2026-11-17T14:00:00Z'},{...e,visitor_id:'b'},...['impression','impression','read','source_click','source_click'].map(kind=>({...e,kind,content_id:'r-a',source:'Cursor',lane:'tools'}))],[{visitor_id:'a',content_id:'r-a',source:'Cursor',lane:'tools',value:'useful',updated_at:e.occurred_at}]);
 assert.equal(result.visitors,2);assert.equal(result.returning,1);assert.equal(result.views,1);assert.equal(result.sourceClicks,1);assert.equal(result.sources[0].useful,1);assert.equal(result.channels[0].visitors,2);
});
test('P1 migration keeps drafts and anonymous feedback private; writes are idempotent and version guarded',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 const sql=await readFile(new URL('../../supabase/migrations/20261117160000_news_reading.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 for(const role of ['anon','authenticated'])for(const table of ['news_briefs','reading_events','reading_feedback'])assert.equal((await db.query<{ok:boolean}>(`select has_table_privilege('${role}','${table}','SELECT') as ok`)).rows[0].ok,false);
 await db.exec('set role service_role');
 await db.exec("insert into news_briefs(slug,title,item_ids) values('2026-11-16','一周精选',array['00000000-0000-4000-8000-000000000001'::uuid]);");
 assert.equal((await db.query("select * from news_briefs where status='published'")).rows.length,0);
 await db.exec("update news_briefs set status='published',version=version+1 where slug='2026-11-16' and version=1;");
 assert.equal((await db.query("update news_briefs set title='stale' where slug='2026-11-16' and version=1 returning id")).rows.length,0);
 const insert="insert into reading_events(visitor_id,kind,content_id,dedupe_key) values('00000000-0000-4000-8000-000000000002','visit','feed','same') on conflict(dedupe_key) do nothing";await db.exec(insert);await db.exec(insert);assert.equal((await db.query('select * from reading_events')).rows.length,1);
 await assert.rejects(db.exec("insert into reading_events(visitor_id,kind,content_id,dedupe_key) values('00000000-0000-4000-8000-000000000002','payment','feed','invalid')"));
 await db.exec("insert into reading_feedback values('00000000-0000-4000-8000-000000000002','r-a','Cursor','tools','neutral',now())");
 await db.exec("insert into reading_feedback values('00000000-0000-4000-8000-000000000002','r-a','Cursor','tools','useful',now()) on conflict(visitor_id,content_id) do update set value=excluded.value");
 assert.deepEqual((await db.query('select value from reading_feedback')).rows,[{value:'useful'}]);
 }finally{await db.close();}
});

test('new recommendations and weekly generation require the new editorial approval record',async()=>{
 for(const path of ['../../lib/reading/data.ts','../news/brief.ts']){const source=await readFile(new URL(path,import.meta.url),'utf8');assert.match(source,/news_queue!inner\(state\)/);assert.match(source,/eq\('news_queue.state','published'\)/);}
});


test('reading scores use existing editorial dimensions and omit missing scores',()=>{
 const base={id:'a',source_url:'https://example.com',score:0} as RadarItem;
 assert.equal(radarItem(base,{scores:[4,5,4]}).score,87);
 assert.equal(radarItem(base).score,null);
 assert.equal(radarItem({...base,score:78}).score,78);
 assert.equal(radarItem(base,{imageUrl:'javascript:alert(1)'}).imageUrl,null);
});
test('saved articles tolerate corrupt storage and deduplicate without touching legacy favorites',async()=>{
 const {parseBookmarks,BOOKMARK_KEY}=await import('../../lib/reading/bookmarks');
 const saved={...item,id:'r-00000000-0000-4000-8000-000000000001'};
 assert.deepEqual(parseBookmarks('{broken'),[]);assert.deepEqual(parseBookmarks('{}'),[]);
 assert.equal(parseBookmarks(JSON.stringify([saved,saved,null,{id:'invalid'}])).length,1);
 assert.notEqual(BOOKMARK_KEY,'ai_trends_favorites');
});

test('X uses stored Chinese translations and preserves original text separately',()=>{
 const base={tweet_id:'123',author_username:'author',content:'New agent tools are available.',url:'https://x.com/author/status/123',published_at:'2026-11-18'} as Tweet;
 const translated=tweetItem({...base,translated_text:'新的 Agent 工具已上线。'});
 assert.equal(translated.summary,'新的 Agent 工具已上线。');assert.equal(translated.originalText,base.content);assert.equal(translated.translated,true);
 const pending=tweetItem(base);assert.equal(pending.summary,'');assert.equal(pending.originalText,base.content);assert.equal(pending.translated,false);
});

test('backfilled stories sort by original publication date rather than insertion order',()=>{
 const recent={...item,id:'r-recent',sourceUrl:'https://example.com/recent',sourcePublishedAt:'2026-11-17T10:00:00Z',publishedAt:'2026-11-17T12:00:00Z'};
 const older={...item,id:'r-old',sourceUrl:'https://example.com/older',sourcePublishedAt:'2026-11-12T10:00:00Z',publishedAt:'2026-11-18T12:00:00Z'};
 assert.deepEqual(mergeReading([older,recent]),[recent,older]);
});
