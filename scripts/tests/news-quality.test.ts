import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { canonicalUrl, discover, extractArticle, publicAddress, imageFromDocument } from '../../lib/news/collect';
import { SOURCES } from '../../lib/news/sources';
import { sameEvent, selectDrafts, validateDraft } from '../../lib/news/policy';
import type { Article, Draft } from '../../lib/news/types';
const source = SOURCES[0];
const sentence = 'The model is available to all developers at a price of 2 dollars per million tokens.';
const article: Article = { sourceId: source.id, title: 'Release', url: 'https://openai.com/release', publishedAt: '2026-11-17T00:00:00Z', snippet: '', body: sentence.repeat(8), bodyHash: 'body', fetchedAt: '2026-11-17T01:00:00Z', state: 'ready', issues: [] };
const draft: Draft = { title: '模型开放', summary: '官方宣布向开发者开放模型。', relevance: '使用前核对定价与适用范围。', lane: 'industry', importance: 5, usefulness: 2, evidence: 4, eventKey: 'company-model-release-v1', eventDate: '2026-11-17', claims: [{ text: '官方宣布开放', quote: sentence, kind: 'attributed' }], sensitive: false };
test('tracking dedup preserves meaningful query parameters', () => {
  assert.equal(canonicalUrl('https://example.com/x?version=2&utm_source=x#part'), 'https://example.com/x?version=2');
  assert.throws(() => canonicalUrl('javascript:alert(1)')); assert.equal(publicAddress('127.0.0.1'), false); assert.equal(publicAddress('169.254.169.254'), false); assert.equal(publicAddress('::ffff:127.0.0.1'), false); assert.equal(publicAddress('8.8.8.8'), true);
});
test('RSS and Atom preserve dates, decode entities, and select alternate not self link', () => {
  const rss = discover(source, '<rss><channel><item><title>A &amp; B</title><link>https://example.com/a</link><description><![CDATA[<p>Detail</p>]]></description><pubDate>Tue, 17 Nov 2026 00:00:00 GMT</pubDate></item></channel></rss>');
  assert.equal(rss[0].title, 'A & B'); assert.equal(rss[0].snippet, 'Detail'); assert.equal(rss[0].publishedAt, '2026-11-17T00:00:00.000Z');
  const atom = discover(source, '<feed><entry><title>A</title><link rel="self" href="https://example.com/feed"/><link rel="alternate" href="https://example.com/story"/></entry></feed>');
  assert.equal(atom[0].url, 'https://example.com/story'); assert.equal(atom[0].publishedAt, null);
});
test('challenge and unavailable original never become usable evidence', () => {
  const a = extractArticle(source, { url: article.url, title: 'Blocked', snippet: '', publishedAt: null }, '<html><main>Just a moment</main></html>');
  assert.equal(a.state, 'blocked'); assert.ok(validateDraft(draft,a).includes('原文不可用'));
});
test('quotes must actually exist in original; malformed model output fails closed', () => {
  assert.deepEqual(validateDraft(draft,article), []);
  assert.ok(validateDraft({ ...draft, claims: [{ ...draft.claims[0], quote: 'This product already has 1000 paying customers.' }] },article).length);
  assert.ok(validateDraft({} as Draft,article).length);
});
test('major industry news needs no invented action; promotional launches are held back', () => {
  const result = selectDrafts([{ article, draft, source }]); assert.equal(result.accepted.length,1);
  const promo = selectDrafts([{ article, draft: { ...draft, lane: 'business' }, source: SOURCES.find(s => s.id === 'showhn')! }]); assert.equal(promo.accepted.length,0);
});
test('same event groups across sources but unknown dates and different versions stay distinct', () => {
  assert.equal(sameEvent(draft,{...draft}),true); assert.equal(sameEvent(draft,{...draft,eventKey:'company-model-release-v2'}),false); assert.equal(sameEvent({...draft,eventDate:null},{...draft,eventDate:null}),false);
});
test('database review is atomic, private, versioned, and cannot publish unsupported quotes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create table radar_items(id uuid primary key default gen_random_uuid(),title text,summary text,source_name text,source_url text,editor_note text,pick_reason text,category text,status text,published_at timestamptz);`);
    await db.exec(await readFile('supabase/migrations/20261117090000_news_quality.sql','utf8'));
    await db.query('insert into news_sources(id,definition) values ($1,$2)',[source.id,JSON.stringify(source)]);
    await db.query('insert into news_documents(id,source_id,url,body_hash,article) values ($1,$2,$3,$4,$5)',['doc',source.id,article.url,'body',JSON.stringify(article)]);
    const inserted = await db.query<{id:string}>("insert into news_queue(document_id,source_id,draft,event_key) values ('doc',$1,$2,'event') returning id",[source.id,JSON.stringify(draft)]); const id = inserted.rows[0].id;
    const review = (version:number, action:string, d:Draft|null, confirm=false) => db.query('select review_news($1,$2,$3,$4,$5,$6)',[id,version,action,d ? JSON.stringify(d) : null,'核对测试',confirm]);
    await assert.rejects(review(1,'publish',draft),/Human fact/);
    await assert.rejects(review(1,'publish',{...draft,claims:[{text:'假的',quote:'not supported by the original evidence',kind:'fact'}]},true),/Evidence quote/);
    assert.equal((await db.query('select * from radar_items')).rows.length,0);
    await review(1,'save',draft); await assert.rejects(review(1,'publish',draft,true),/Version conflict/);
    await review(2,'publish',draft,true); assert.equal((await db.query('select * from radar_items')).rows.length,1);
    await assert.rejects(db.query("update radar_items set summary='bypass'"),/新版采编台/);
    await review(3,'unpublish',null); await review(4,'publish',draft,true); assert.equal((await db.query('select * from radar_items')).rows.length,1);
    assert.equal((await db.query('select * from news_review_log')).rows.length,4);
    await db.query('insert into news_documents(id,source_id,url,body_hash,article) values ($1,$2,$3,$4,$5)',['doc2',source.id,'https://openai.com/other','body2',JSON.stringify(article)]);
    const second = await db.query<{id:string}>("insert into news_queue(document_id,source_id,draft,event_key) values ('doc2',$1,$2,'event') returning id",[source.id,JSON.stringify(draft)]);
    await assert.rejects(db.query('select review_news($1,1,$2,$3,$4,true)',[second.rows[0].id,'publish',JSON.stringify(draft),'重复发布测试']),/unique constraint/);
    assert.equal((await db.query('select * from radar_items')).rows.length,1);
    await db.query('select review_news($1,1,$2,null,$3,false,$4)',[second.rows[0].id,'merge','确认同一事件',id]);
    await db.query('select review_news($1,2,$2,null,$3,false)',[second.rows[0].id,'restore','撤销错误合并']);
    assert.equal((await db.query<{state:string,merged_into:string|null}>('select state,merged_into from news_queue where id=$1',[second.rows[0].id])).rows[0].merged_into,null);
    await db.exec('set role anon'); await assert.rejects(db.query('select * from news_documents'),/permission denied/); await assert.rejects(review(5,'unpublish',null),/permission denied/); await db.exec('reset role');
  } finally { await db.close(); }
});


test('model retries transient rate limits but bounds attempts and rejects auth failures', async () => {
  const { requestModel } = await import('../../lib/news/model-request');
  const waits: number[] = [];
  let calls = 0;
  const response = await requestModel(async () => ++calls === 1
    ? new Response('', { status: 429, headers: { 'Retry-After': '25' } })
    : new Response('{}'), async ms => { waits.push(ms); });
  assert.equal(response.status, 200); assert.equal(calls, 2); assert.deepEqual(waits, [25000]);
  calls = 0;
  await assert.rejects(requestModel(async () => { calls++; return new Response('', { status: 429 }); }, async () => {}), /after 3 attempt/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(requestModel(async () => { calls++; return new Response('', { status: 401 }); }, async () => {}), /HTTP 401/);
  assert.equal(calls, 1);
});


test('news generation requires DeepSeek credentials and never falls back to Zhipu', async () => {
  const { newsModelConfig } = await import('../../lib/news/model-request');
  assert.throws(() => newsModelConfig({ ZHIPU_API_KEY: 'old-provider-key' }), /DEEPSEEK_API_KEY/);
  const config = newsModelConfig({ DEEPSEEK_API_KEY: 'test-key', ZHIPU_API_KEY: 'old-provider-key' });
  assert.equal(config.endpoint, 'https://api.deepseek.com/chat/completions');
  assert.equal(config.apiKey, 'test-key');
  assert.equal(config.model, 'deepseek-flash');
  assert.throws(() => newsModelConfig({ DEEPSEEK_API_KEY: 'test-key', NEWS_MODEL: 'glm-4.7-flash' }), /DeepSeek model/);
});

test('article images come from source metadata and reject executable URLs',()=>{
 const html='<meta property="og:image" content="/cover.jpg"><article>'+sentence.repeat(10)+'</article>';
 assert.equal(extractArticle(source,{url:'https://example.com/news',title:'News',snippet:'',publishedAt:null},html).imageUrl,'https://example.com/cover.jpg');
 assert.equal(extractArticle(source,{url:'https://example.com/news',title:'News',snippet:'',publishedAt:null},html.replace('/cover.jpg','javascript:alert(1)')).imageUrl,null);
});

test('thumbnail extraction accepts the fetched document envelope and resolves against its final URL',()=>{
 assert.equal(imageFromDocument({url:'https://example.com/final/post',text:'<meta property="og:image" content="../cover.png">'}),'https://example.com/cover.png');
 assert.equal(imageFromDocument({url:'https://example.com',text:'<title>No image</title>'}),null);
});
