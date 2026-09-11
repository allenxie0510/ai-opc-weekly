// Force complete, small-batch review rather than one opaque top-N summary of 54
// items. Every source gets either a proposal or an explicit rejection reason.
import { assertEditorialShape, validateEditorialBrief } from '../../lib/editorial-policy.mjs';

export function assertEditorialReview(result, materials) {
  assertEditorialShape(result.items || []);
  for (const item of result.items || []) {
    const material = materials.find(m => m.source_url === item.source_url);
    const checked = material && validateEditorialBrief(item.editorial_brief, material);
    if (!checked?.ok) throw new Error(`六问校验失败：${checked?.reason || 'unknown-source'}。仅用本条原文补齐；引用不翻译、不拼接，地区不明确填 unknown；确无证据请放入 rejected`);
  }
}

// Output/quote failures are not a judgment that the underlying source is bad.
export function cacheableReviewMaterials(materials, rejected) {
  const retryable = new Set(rejected.filter(r => /^(six-questions|missing-answer|ungrounded-answer|inference-has-quote|invalid-editorial|market-without|excessive-quotation|opc-value-quotes|evidence-quote|source-cap|daily-cap|building-tools-cap|large-company-cap)/.test(r.reason)).map(r => r.source_url));
  return materials.filter(m => !retryable.has(m.source_url));
}

export function assertReviewCoverage(result, materials) {
  const expected = new Set(materials.map(m => m.source_url));
  const reviewed = new Set();
  for (const row of result.items || []) {
    if (!expected.has(row.source_url) || reviewed.has(row.source_url)) throw new Error('Review has unknown or duplicate source URL');
    reviewed.add(row.source_url);
  }
  for (const row of result.rejected || []) {
    if (!expected.has(row.source_url) || reviewed.has(row.source_url) || String(row.reason || '').trim().length < 4) throw new Error('Review has invalid rejection');
    reviewed.add(row.source_url);
  }
  if (reviewed.size !== expected.size) throw new Error(`Incomplete review: ${reviewed.size}/${expected.size} sources`);
}
export async function reviewInBatches(materials, review, batchSize = 12) {
  const result = { items: [], rejected: [] };
  for (let offset = 0; offset < materials.length; offset += batchSize) {
    const batch = materials.slice(offset, offset + batchSize);
    const response = await review(batch, offset / batchSize + 1);
    assertReviewCoverage(response, batch);
    result.items.push(...response.items);
    result.rejected.push(...(response.rejected || []));
  }
  return result;
}
