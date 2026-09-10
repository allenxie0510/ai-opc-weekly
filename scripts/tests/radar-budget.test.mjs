import test from 'node:test';
import assert from 'node:assert/strict';
import { RADAR_BUDGET, reviewCapacity, beijingDayStart, selectIntake, leanEligible, materialKey, recentlyReviewed, readReviewLoad } from '../lib/radar-budget.mjs';
import { fetchProductHunt } from '../lib/producthunt-source.mjs';

test('每轮3/每日6/待审12，使用剩余容量，不因反复点击不断新增', () => {
  assert.equal(reviewCapacity(), 3);
  assert.equal(reviewCapacity({ pending: 11, today: 0 }), 1);
  assert.equal(reviewCapacity({ pending: 4, today: 5 }), 1);
  assert.equal(reviewCapacity({ pending: 12, today: 0 }), 0);
  assert.equal(reviewCapacity({ pending: 0, today: 6 }), 0);
  assert.equal(reviewCapacity({ pending: 30, today: 20 }), 0);
});
test('每日额度按北京时间换日，读取失败不能视为零负荷', async () => {
  assert.equal(beijingDayStart(Date.parse('2026-09-10T15:59:00Z')), '2026-09-09T16:00:00.000Z');
  assert.equal(beijingDayStart(Date.parse('2026-09-10T16:01:00Z')), '2026-09-10T16:00:00.000Z');
  const load = await readReviewLoad(async path => Array.from({ length: path.includes('status=eq.draft') ? 11 : 2 }, (_, id) => ({ id })));
  assert.deepEqual(load, { pending: 11, today: 2, capacity: 1 });
  await assert.rejects(readReviewLoad(async () => ({ error: 'bad' })), /无法读取/);
});
test('入口先排低价值和重复再限24，保留国内经营预留而非堆积中文文章', () => {
  const rows = ['w2solo', 'V2EX 分享创造', '少数派', 'Product Hunt', 'Show HN', 'BetaList AI', 'TechCrunch AI'].flatMap(source_name => Array.from({ length: 20 }, (_, i) => ({ source_name, source_url: `https://example.com/${source_name}/${i}`, title: 'AI design service', snippet: ['w2solo', 'V2EX 分享创造'].includes(source_name) ? '面向国内商家的 AI 商品图设计服务，提供订单交付和报价。' : 'AI design templates for freelancers to deliver client orders.' })));
  const selected = selectIntake(rows);
  assert.equal(selected.length, RADAR_BUDGET.intake);
  assert.equal(selected.filter(r => ['w2solo', 'V2EX 分享创造'].includes(r.source_name)).length, 12);
  assert.equal(selected.some(r => r.source_name === 'TechCrunch AI'), false);
  assert.equal(leanEligible({ title: 'AI 新品发布', snippet: 'AI AI AI', source_url: 'https://example.com/low' }), false);
  const seen = new Set(selected.map(r => r.source_url));
  assert.equal(selectIntake(selected, seen).length, 0);
});
test('相同拒稿七天内不重复入模，内容变化可重审；hash中无正文', () => {
  const row = { source_url: 'https://example.com/a', title: 'title', snippet: 'body' }, now = Date.now();
  const state = { reviewed: { [materialKey(row)]: now } };
  assert.match(materialKey(row), /^[a-f0-9]{64}$/);
  assert.equal(recentlyReviewed(row, state, now), true);
  assert.equal(recentlyReviewed({ ...row, snippet: 'changed' }, state, now), false);
  assert.equal(recentlyReviewed(row, state, now + 8 * 86400000), false);
});
test('PH 精简请求只有两天各8条，API成功不再重复请求RSS', async () => {
  const calls = [];
  const result = await fetchProductHunt({ token: 'test', days: 2, perDay: 8, feedFallbackOnly: true, warn() {}, fetchImpl: async (url, init) => {
    calls.push(url);
    assert.match(JSON.parse(init.body).query, /first: 8/);
    return Response.json({ data: { posts: { edges: [{ node: { name: 'Test', description: 'AI design for freelancers', url: 'https://example.com/product' } }] } } });
  } });
  assert.equal(calls.length, 2);
  assert.equal(result.report.feedCount, 0);
});
