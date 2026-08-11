/**
 * OPC Radar · 封面图回填脚本（一次性 / 按需手动执行）
 * 为近 30 天已发布/草稿、且尚无 image_url 的 radar_items 抓取 OG 封面并更新
 *
 * 用法：node scripts/backfill-images.mjs
 * 由 GitHub Actions 手动触发（backfill-images.yml，workflow_dispatch）
 *
 * 前置条件：radar_items 表已有 image_url 列
 *   alter table radar_items add column if not exists image_url text;
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) { console.error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }
if (!SRK) { console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${txt.slice(0, 200)}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

async function fetchOgImage(url) {
  try {
    if (!/^https?:\/\//i.test(url)) return '';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return '';
    const html = (await res.text()).slice(0, 200 * 1024);
    const m =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image/i) ||
      html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image/i);
    if (!m) return '';
    const img = m[1].trim().replace(/&amp;/g, '&');
    return /^https?:\/\//i.test(img) ? img : '';
  } catch {
    return '';
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🖼️ OPC Radar · 封面图回填');

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await sb(
    `/radar_items?select=id,title,source_url&image_url=is.null&status=in.(published,draft)&published_at=gte.${encodeURIComponent(cutoff)}&order=published_at.desc&limit=50`
  );
  console.log(`   待回填: ${(rows || []).length} 条`);
  if (!rows || rows.length === 0) { console.log('✅ 无需回填'); return; }

  let ok = 0, miss = 0, fail = 0;
  for (const row of rows) {
    const img = await fetchOgImage(row.source_url);
    if (img) {
      try {
        await sb(`/radar_items?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ image_url: img }),
        });
        ok++;
        console.log(`   ✅ ${row.title.slice(0, 30)} → ${img.slice(0, 60)}`);
      } catch (e) {
        fail++;
        console.log(`   ❌ 更新失败 ${row.title.slice(0, 30)}: ${e.message.slice(0, 60)}`);
      }
    } else {
      miss++;
      console.log(`   ⬜ 无封面 ${row.title.slice(0, 30)}`);
    }
    await sleep(400); // 友好限速
  }

  console.log(`\n📊 汇总: 回填 ${ok} / 无封面 ${miss} / 失败 ${fail}`);
  console.log('✅ 回填完成');
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
