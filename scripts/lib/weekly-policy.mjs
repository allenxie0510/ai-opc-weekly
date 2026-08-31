export const MIN_WEEKLY_ITEMS = 5;
export const TARGET_WEEKLY_ITEMS = 6;

export function weeklyIssuePlan(issue, itemCount = 0) {
  const count = Math.max(0, Number(itemCount) || 0);
  if (issue?.status === 'published') {
    return { skip: true, reason: 'published', existingCount: count, needed: 0 };
  }
  if (count >= MIN_WEEKLY_ITEMS) {
    return { skip: true, reason: 'minimum-met', existingCount: count, needed: 0 };
  }
  return {
    skip: false,
    reason: issue ? 'supplement-draft' : 'new-issue',
    existingCount: count,
    needed: Math.max(0, TARGET_WEEKLY_ITEMS - count),
  };
}

export function canonicalSourceUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|source_id$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return '';
  }
}

export function buildMaterialIndex(materials = []) {
  const index = new Map();
  for (const material of materials) {
    const key = canonicalSourceUrl(material?.source_url);
    if (key && !index.has(key)) index.set(key, material);
  }
  return index;
}

/**
 * Only keep references that came from the already-ingested API/RSS/X material
 * pool. The model may choose and explain a source, but it cannot invent one.
 */
export function filterGroundedRefs(refs = [], materialIndex = new Map()) {
  const accepted = [];
  const seen = new Set();
  for (const ref of Array.isArray(refs) ? refs : []) {
    const key = canonicalSourceUrl(ref?.url);
    const material = key ? materialIndex.get(key) : null;
    if (!material || seen.has(key)) continue;
    seen.add(key);
    accepted.push({
      label: String(ref?.label || material.source_name || '来源').slice(0, 50),
      url: material.source_url,
    });
  }
  return accepted.slice(0, 3);
}

const GENERIC_PRODUCT_TERMS = new Set([
  'ai', 'opc', 'saas', 'micro', 'tool', 'tools', 'app', 'apps', 'platform',
  'assistant', 'generator', 'automation', 'software', 'product',
]);

export function productIdentity(title) {
  const quoted = String(title || '').match(/[《「“]([^》」”]{2,40})[》」”]/)?.[1];
  if (quoted) return quoted.trim().toLowerCase();
  const prefix = String(title || '').split(/[：:—|]/, 1)[0];
  const terms = (prefix.match(/[A-Za-z][A-Za-z0-9.-]{2,}/g) || [])
    .filter(term => !GENERIC_PRODUCT_TERMS.has(term.toLowerCase()))
    .slice(0, 3);
  return terms.join(' ').toLowerCase();
}
