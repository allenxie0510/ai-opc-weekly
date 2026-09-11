import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReviewCoverage, assertEditorialReview, cacheableReviewMaterials, reviewInBatches } from '../lib/radar-review.mjs';
import { EDITORIAL_BRIEF_TEMPLATE } from '../../lib/editorial-policy.mjs';
import { readFileSync } from 'node:fs';

test('每条素材必须明确接受或拒绝，不允许模型默默漏看', () => {
  const materials = [{ source_url: 'https://a.test/1' }, { source_url: 'https://a.test/2' }];
  assert.throws(() => assertReviewCoverage({ items: [materials[0]], rejected: [] }, materials), /Incomplete/);
  assert.throws(() => assertReviewCoverage({ items: [materials[0], materials[0]] }, materials), /duplicate/);
  assert.throws(() => assertReviewCoverage({ items: [{ source_url: 'https://a.test/fake' }] }, materials), /unknown/);
  assertReviewCoverage({ items: [materials[0]], rejected: [{ ...materials[1], reason: 'Only a launch story, no usable business workflow' }] }, materials);
});

test('按12条分批，最后一批和低曝光位置也必须完整评估', async () => {
  const materials = Array.from({ length: 53 }, (_, i) => ({ source_url: `https://a.test/${i}` }));
  const sizes = [];
  const r = await reviewInBatches(materials, async batch => { sizes.push(batch.length); return { items: batch, rejected: [] }; });
  assert.deepEqual(sizes, [12, 12, 12, 12, 5]);
  assert.equal(r.items.length, 53);
  assert.equal(r.items.at(-1).source_url, materials.at(-1).source_url);
});

test('旧JSON即使覆盖全部URL也必须重试，不能缓存成内容拒稿', () => {
  const material = { source_url: 'https://example.com/product', title: '测试 AI 设计服务', snippet: '面向商家提供AI商品图设计和订单交付。' };
  const result = { items: [{ source_url: material.source_url }], rejected: [] };
  assertReviewCoverage(result, [material]);
  assert.throws(() => assertEditorialReview(result, [material]), /editorial_brief/);
  assert.deepEqual(cacheableReviewMaterials([material], [{ source_url: material.source_url, reason: 'six-questions-missing' }]), []);
  for (const reason of ['opc-value-quotes-not-in-material', 'daily-cap', 'ungrounded-answer-ai_role']) {
    assert.equal(cacheableReviewMaterials([material], [{ source_url: material.source_url, reason }]).length, 0);
  }
  assert.equal(cacheableReviewMaterials([material], [{ source_url: material.source_url, reason: 'low-opc-score' }]).length, 1);
});

test('六问在真实输出示例中而非仅在提示词散文中，雷达和周报均校验', () => {
  assert.equal(Object.keys(EDITORIAL_BRIEF_TEMPLATE.answers).length, 6);
  const radar = readFileSync(new URL('../generate-radar.mjs', import.meta.url), 'utf8');
  const weekly = readFileSync(new URL('../generate-weekly.mjs', import.meta.url), 'utf8');
  assert.match(radar, /"editorial_brief": \$\{JSON.stringify\(EDITORIAL_BRIEF_TEMPLATE\)\}/);
  assert.match(radar, /assertEditorialReview\(parsed, materials\)/);
  assert.match(weekly, /assertEditorialShape\(items\)/);
});
