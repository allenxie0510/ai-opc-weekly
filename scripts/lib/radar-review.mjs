// Force complete, small-batch review rather than one opaque top-N summary of 54
// items. Every source gets either a proposal or an explicit rejection reason.
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
