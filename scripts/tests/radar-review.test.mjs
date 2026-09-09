import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReviewCoverage, reviewInBatches } from '../lib/radar-review.mjs';

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
