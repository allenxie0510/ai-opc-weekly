/**
 * AI OPC · 机会封面回填脚本（按需手动执行）
 * 为 opportunities 表中 cover_url 为空的 draft/published 机会
 * 走与生产线 Stage 4 相同的两级管线（og:image 原图转存 → Seedream 4.5 静物生成），回写 cover_url
 *
 * 用法：node scripts/backfill-covers.mjs [--force] [--clear=slug1,slug2] [--prune]
 *   默认只处理 cover_url 为空的；--force（或 BACKFILL_FORCE=1）重生成全部
 *   --clear=slug1,slug2（或 BACKFILL_CLEAR）先把指定 slug 的 cover_url 置 NULL，再走正常回填
 *   --prune（或 BACKFILL_PRUNE=1）回填结束后清理 covers 桶里未被任何机会引用的 opp-* 孤儿文件
 * 由 GitHub Actions 手动触发（backfill-covers.yml，workflow_dispatch）
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   （ZHIPU_API_KEY / ARK_API_KEY 仅 Track 2 生成兜底需要，cover.mjs 内部优雅降级）
 * 前置条件：opportunities 表已有 cover_url 列
 *   alter table opportunities add column if not exists cover_url text;
 */

import { generateOpportunityCover, sha256Hex } from './lib/cover.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'covers';

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 把指定 slug 的 cover_url 置 NULL（下一步正常回填会重新生成） */
async function clearCovers(slugs) {
  for (const slug of slugs) {
    await sb(`/opportunities?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ cover_url: null }),
    });
    console.log(`   🧹 已清空封面: ${slug}`);
  }
}

/** 下载现有封面算 sha256 预载入 usedHashes（防新封面与保留封面内容撞图） */
async function seedExistingHashes(usedHashes) {
  try {
    const existing = await sb(`/opportunities?select=cover_url&cover_url=not.is.null&limit=100`);
    for (const r of existing || []) {
      try {
        const res = await fetch(r.cover_url, { signal: AbortSignal.timeout(15000) });
        if (res.ok) usedHashes.add(sha256Hex(Buffer.from(await res.arrayBuffer())));
      } catch { /* 单个下载失败不阻塞 */ }
    }
    console.log(`   🔐 已收录 ${usedHashes.size} 张现有封面哈希（防新旧撞图）`);
  } catch (e) {
    console.log(`   ⚠️ 预载现有封面哈希失败（继续）: ${e.message.slice(0, 60)}`);
  }
}

/** 清理 covers 桶里未被任何机会引用的 opp-* 孤儿文件 */
async function pruneOrphans() {
  console.log('\n🧹 清理 covers 桶孤儿文件...');
  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1000, prefix: '' }),
  });
  if (!listRes.ok) {
    console.log(`   ⚠️ 列出 bucket 文件失败: SB ${listRes.status}`);
    return;
  }
  const objects = (await listRes.json() || [])
    .map(o => o.name)
    .filter(n => /^opp-[\w-]+\.(png|jpe?g|webp|avif)$/i.test(n));

  const rows = await sb(`/opportunities?select=cover_url&cover_url=not.is.null&limit=200`);
  const referenced = new Set((rows || []).map(r => String(r.cover_url).split('/').pop()));

  let deleted = 0;
  for (const name of objects) {
    if (referenced.has(name)) continue;
    const del = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'DELETE',
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
    });
    if (del.ok) { deleted++; console.log(`   🗑️ 已删除孤儿文件: ${name}`); }
    else console.log(`   ⚠️ 删除失败 ${name}: SB ${del.status}`);
  }
  console.log(`   孤儿文件清理完成: 删除 ${deleted} / 扫描 ${objects.length}`);
}

async function main() {
  const force = process.argv.includes('--force') || process.env.BACKFILL_FORCE === '1';
  const prune = process.argv.includes('--prune') || process.env.BACKFILL_PRUNE === '1';
  const clearArg = process.argv.find(a => a.startsWith('--clear='));
  const clearList = (clearArg ? clearArg.slice(8) : (process.env.BACKFILL_CLEAR || ''))
    .split(',').map(s => s.trim()).filter(Boolean);
  console.log(`🎨 AI OPC · 机会封面回填${force ? '（force：全量重生成）' : ''}\n`);

  if (clearList.length) await clearCovers(clearList);

  let rows;
  try {
    rows = await sb(
      `/opportunities?select=id,slug,title,thesis,category,evidence${force ? '' : '&cover_url=is.null'}&status=in.(draft,published)&order=published_at.desc&limit=50`
    );
  } catch (e) {
    if (/42703|column.*cover_url|cover_url.*column/i.test(e.message)) {
      console.error('❌ opportunities 表缺少 cover_url 列，请先在 Supabase 执行：');
      console.error('   alter table opportunities add column if not exists cover_url text;');
      process.exit(1);
    }
    throw e;
  }

  console.log(`   待回填: ${(rows || []).length} 条`);

  let ok = 0, fail = 0;
  const usedOgUrls = new Set(); // 本轮已占用的 og 图 URL（URL 级去重）
  const usedHashes = new Set(); // 已有封面的 sha256（内容级去重）
  const usedScenes = [];        // 本轮已提炼的隐喻（防多条机会隐喻雷同）
  if (!force && rows?.length) await seedExistingHashes(usedHashes);
  for (const row of rows || []) {
    const coverUrl = await generateOpportunityCover(row, { usedOgUrls, usedHashes, usedScenes });
    if (!coverUrl) { fail++; continue; }
    try {
      await sb(`/opportunities?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ cover_url: coverUrl }),
      });
      ok++;
      console.log(`   ✅ ${String(row.title).slice(0, 30)} → ${coverUrl.slice(-50)}`);
    } catch (e) {
      fail++;
      console.log(`   ❌ 回写失败 ${String(row.title).slice(0, 30)}: ${e.message.slice(0, 60)}`);
    }
    await sleep(1500); // 限速，避免抓取/生图并发挤压
  }

  console.log(`\n📊 汇总: 回填成功 ${ok} / 失败 ${fail}`);
  if (prune) await pruneOrphans();
  console.log('✅ 回填完成');
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
