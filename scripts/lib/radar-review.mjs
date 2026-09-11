// Force complete, small-batch review rather than one opaque top-N summary of 54
// items. Every source gets either a proposal or an explicit rejection reason.
import { assertEditorialShape, validateEditorialBrief } from '../../lib/editorial-policy.mjs';
import { filterRadarItems } from './radar-policy.mjs';

export function assertEditorialReview(result, materials) {
  assertEditorialShape(result.items || []);
  for (const item of result.items || []) {
    const material = materials.find(m => m.source_url === item.source_url);
    const checked = material && validateEditorialBrief(item.editorial_brief, material);
    if (!checked?.ok) {
      const key = checked?.reason?.replace(/^missing-answer-/, '');
      const field = item.editorial_brief?.answers?.[key];
      const detail = checked?.reason?.startsWith('missing-answer-') ? `（answer=${JSON.stringify(field?.answer)}, basis=${JSON.stringify(field?.basis)}）` : '';
      throw new Error(`六问校验失败：${checked?.reason || 'unknown-source'}${detail}。仅用本条原文补齐；引用不翻译、不拼接，地区不明确填 unknown；确无证据请放入 rejected`);
    }
    const gate = filterRadarItems([item], [material], { requireEditorialBrief: true });
    const reason = gate.rejected[0]?.reason || '';
    if (/^(evidence-quote|opc-value-quotes|missing-copy|missing-concrete-opc-value)/.test(reason)) throw new Error(`条目格式/引用校验失败：${reason}；只从该URL素材逐字复制引文，补全必填字段，无法支撑则 rejected`);
  }
}

/** One malformed proposal must not erase other, evidence-valid proposals. */
export async function reviewWithEditorialRepair(materials, review, repair = review) {
  const first = await review(materials, '');
  assertReviewCoverage(first, materials);
  const result = { items: [], rejected: [...(first.rejected || [])] };
  const invalid = [];
  for (const item of first.items) {
    const material = materials.find(m => m.source_url === item.source_url);
    try { assertEditorialReview({ items: [item] }, [material]); result.items.push(item); }
    catch (error) { invalid.push({ material, reason: error.message }); }
  }
  if (!invalid.length) return result;
  const retryMaterials = invalid.map(row => row.material);
  const feedback = invalid.map(row => `${row.material.source_url}: ${row.reason}`).join('\n');
  try {
    const retry = await repair(retryMaterials, feedback, first.items);
    assertReviewCoverage(retry, retryMaterials);
    result.rejected.push(...(retry.rejected || []));
    for (const item of retry.items) {
      const material = retryMaterials.find(m => m.source_url === item.source_url);
      try { assertEditorialReview({ items: [item] }, [material]); result.items.push(item); }
      catch (error) { result.rejected.push({ source_url: item.source_url, reason: `review-invalid: ${error.message}` }); console.warn(`证据提取未通过 ${item.source_url}: ${error.message}`); }
    }
  } catch {
    result.rejected.push(...retryMaterials.map(m => ({ source_url: m.source_url, reason: 'review-unavailable: 格式修复服务失败，保留后续重试' })));
  }
  assertReviewCoverage(result, materials);
  return result;
}

// Output/quote failures are not a judgment that the underlying source is bad.
export function cacheableReviewMaterials(materials, rejected) {
  const retryable = new Set(rejected.filter(r => /^(review-invalid|review-unavailable|missing-copy|missing-concrete-opc-value|six-questions|missing-answer|ungrounded-answer|inference-has-quote|invalid-editorial|market-without|excessive-quotation|opc-value-quotes|evidence-quote|source-cap|daily-cap|building-tools-cap|large-company-cap)/.test(r.reason)).map(r => r.source_url));
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
export async function reviewInBatches(materials, review, batchSize = 12, { continueOnError = false } = {}) {
  const result = { items: [], rejected: [] };
  for (let offset = 0; offset < materials.length; offset += batchSize) {
    const batch = materials.slice(offset, offset + batchSize);
    try {
      const response = await review(batch, offset / batchSize + 1);
      assertReviewCoverage(response, batch);
      result.items.push(...response.items);
      result.rejected.push(...(response.rejected || []));
    } catch (error) {
      if (!continueOnError) throw error;
      result.rejected.push(...batch.map(m => ({ source_url: m.source_url, reason: 'review-unavailable: 本批模型服务或结构校验失败，保留后续重试' })));
    }
  }
  return result;
}
