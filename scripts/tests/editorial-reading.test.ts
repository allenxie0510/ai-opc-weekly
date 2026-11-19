import test from 'node:test';
import assert from 'node:assert/strict';
import {editorialPicks,searchReading} from '../../lib/reading/editorial';
import type {ReadingItem} from '../../lib/reading/model';
const now=Date.parse('2026-11-19T00:00:00Z');
const item:ReadingItem={id:'a',kind:'radar',title:'Agent 成本',summary:'OpenRouter 限额',relevance:'个人开发者',source:'Official',sourceUrl:'https://example.com',lane:'tools',publishedAt:'2026-11-18T00:00:00Z',sourcePublishedAt:null,reviewed:true,score:80};
test('shortlist excludes unreviewed and stale items and preserves source diversity',()=>{
 const picks=editorialPicks([item,{...item,id:'old',publishedAt:'2026-10-01',score:100},{...item,id:'raw',reviewed:false,score:100},{...item,id:'business',source:'Other',lane:'business',score:75}],now);
 assert.deepEqual(picks.map(p=>p.id),['a','business']);
});
test('search combines case-insensitive terms across title, source and reader relevance',()=>{
 assert.equal(searchReading([item],'agent OPENrouter').length,1);assert.equal(searchReading([item],'个人').length,1);assert.equal(searchReading([item],'missing').length,0);assert.equal(searchReading([item],'   ').length,1);
});


test('every configured source has a reader page distinct from its RSS endpoint',async()=>{
 const {SOURCES}=await import('../../lib/news/sources');
 const {SOURCE_PAGES,sourcePageUrl}=await import('../../lib/news/source-pages');
 assert.equal(Object.keys(SOURCE_PAGES).length,SOURCES.length);
 for(const source of SOURCES){const page=sourcePageUrl(source);assert.equal(new URL(page).protocol,'https:');assert.ok(SOURCE_PAGES[source.id]);if(source.kind==='rss')assert.notEqual(page,source.url);assert.ok(!/\.(xml|rss|atom)(?:$|\?)/.test(page));}
});
