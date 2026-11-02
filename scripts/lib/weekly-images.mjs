import { createHash } from 'node:crypto';
import { findEvidenceImage } from './ogimage.mjs';
import { weeklyDb } from './weekly-db.mjs';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Only copy actual raster images, never HTML error pages or active SVG content. */
export function rasterType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { type: 'image/png', ext: 'png' };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { type: 'image/jpeg', ext: 'jpg' };
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

async function readImage(url, request) {
  const response = await request(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new Error('image-unavailable-or-too-large');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error('image-too-large');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks);
  const format = rasterType(bytes);
  if (bytes.length < 4096 || !format) throw new Error('not-a-content-image');
  return { bytes, ...format };
}

export async function storeWeeklyImage({ bytes, type, ext }) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('missing-storage-credentials');
  const filename = `weekly-${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.${ext}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const response = await fetch(`${base}/storage/v1/object/covers/${filename}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' }, body: bytes,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`storage-upload-${response.status}`);
  return `${base}/storage/v1/object/public/covers/${filename}`;
}

/** Use real source-page social images; no generated substitutes or invented image URLs. */
export async function fetchWeeklyCover(refs, { findImage = findEvidenceImage, request = fetch, store = storeWeeklyImage } = {}) {
  for (const ref of (Array.isArray(refs) ? refs : []).slice(0, 3)) {
    if (!/^https?:\/\//i.test(ref?.url || '')) continue;
    try {
      let image;
      const found = await findImage([{ source_url: ref.url }], {
        accept: async url => {
          try { image = await readImage(url, request); return true; } catch { return false; }
        },
      });
      if (!found || !image) continue;
      const image_url = await store(image);
      return { image_url, image_source_url: ref.url };
    } catch (error) {
      console.warn(`周报配图暂不可用: ${new URL(ref.url).hostname} / ${error.message}`);
    }
  }
  return null;
}

/** Idempotent backfill used by the weekly pipeline and the one-off CLI. */
export async function backfillWeeklyImages(slug, { db = weeklyDb, findCover = fetchWeeklyCover } = {}) {
  if (!/^[a-z0-9-]+$/i.test(slug)) throw new Error('invalid-issue-slug');
  const [issue] = await db(`/weekly_issues?slug=eq.${encodeURIComponent(slug)}&select=id,slug,cover_image&limit=1`);
  if (!issue) throw new Error(`weekly-issue-not-found: ${slug}`);
  const items = await db(`/news_items?weekly_issue_id=eq.${issue.id}&order=rank.asc`);
  let saved = 0, unavailable = 0;
  for (const item of items) {
    if (item.image_url || item.section === 'rejected') continue;
    const cover = await findCover(item.refs);
    if (!cover) { unavailable++; console.log(`无合适原图: ${item.title}`); continue; }
    const updated = await db(`/news_items?id=eq.${item.id}&or=(image_url.is.null,image_url.eq.)`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(cover),
    });
    if (updated?.length === 1) { Object.assign(item, cover); saved++; console.log(`已补配图: ${item.title}`); }
  }
  const lead = items.find(item => item.image_url && item.section !== 'rejected');
  if (!issue.cover_image && lead) await db(`/weekly_issues?id=eq.${issue.id}&or=(cover_image.is.null,cover_image.eq.)`, {
    method: 'PATCH', body: JSON.stringify({ cover_image: lead.image_url }),
  });
  return { slug, saved, unavailable, total: items.length };
}
