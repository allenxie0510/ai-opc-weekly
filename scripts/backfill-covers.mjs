/**
 * AI OPC · 机会封面回填脚本（按需手动执行）
 * 为 opportunities 表中 cover_url 为空的 draft/published 机会
 * 走与生产线 Stage 4 相同的两级管线（og:image 原图转存 → Seedream 4.5 静物生成），回写 cover_url
 *
 * 用法：node scripts/backfill-covers.mjs [--force] [--clear=slug1,slug2] [--prune]
 *   默认只处理 cover_url 为空的；--force（或 BACKFILL_FORCE=1）重生成全部
 *   --clear=slug1,slug2（或 BACKFILL_CLEAR）只为指定 slug 重新生图；成功后替换，失败保留原图
 *   --prune（或 BACKFILL_PRUNE=1）回填结束后清理 covers 桶里未被任何机会引用的 opp-* 孤儿文件
 * 由 GitHub Actions 手动触发（backfill-covers.yml，workflow_dispatch）
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   （手动重生成需要 ZHIPU_API_KEY / ARK_API_KEY；失败会使任务失败）
 * 前置条件：opportunities 表已有 cover_url 列
 *   alter table opportunities add column if not exists cover_url text;
 */

import { pathToFileURL } from 'node:url';
import { generateOpportunityCover, sha256Hex } from './lib/cover.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'covers';

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${txt.slice(0, 200)}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

export async function runBackfill({ force = false, prune = false, slugs = [] } = {}, {
  query = sb, generateCover = generateOpportunityCover, seedHashes = seedExistingHashes,
  pruneCovers = pruneOrphans, wait = sleep,
} = {}) {
  if (slugs.some(slug => !/^[a-z0-9-]+$/i.test(slug))) throw new Error('无效的机会 slug');
  console.log(`🎨 AI OPC · 机会封面回填${slugs.length ? '（指定机会重新生图）' : ''}\n`);
  let rows;
  try {
    const select = '/opportunities?select=id,slug,title,thesis,category,evidence,cover_url&status=in.(draft,published)';
    if (slugs.length) {
      rows = [];
      for (const slug of new Set(slugs)) {
        const found = await query(`${select}&slug=eq.${encodeURIComponent(slug)}`);
        if (found?.length !== 1) throw new Error(`未找到可生成封面的机会: ${slug}`);
        rows.push(found[0]);
      }
    } else {
      rows = await query(`${select}${force ? '' : '&cover_url=is.null'}&order=published_at.desc&limit=50`);
    }
  } catch (e) {
    if (/42703|column.*cover_url|cover_url.*column/i.test(e.message)) {
      console.error('❌ opportunities 表缺少 cover_url 列，请先在 Supabase 执行：');
      console.error('   alter table opportunities add column if not exists cover_url text;');
      throw e;
    }
    throw e;
  }

  console.log(`   待回填: ${(rows || []).length} 条`);

  let ok = 0, fail = 0;
  const usedOgUrls = new Set(); // 本轮已占用的 og 图 URL（URL 级去重）
  const usedHashes = new Set(); // 已有封面的 sha256（内容级去重）
  if (!force && !slugs.length && rows?.length) await seedHashes(usedHashes);
  for (const row of rows || []) {
    try {
      const coverUrl = await generateCover(row, { usedOgUrls, usedHashes, forceGenerate: force || slugs.length > 0 });
      if (!coverUrl) throw new Error('封面生成失败，保留原封面');
      const saved = await query(`/opportunities?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cover_url: coverUrl }),
      });
      if (!Array.isArray(saved) || saved.length !== 1 || saved[0].cover_url !== coverUrl) throw new Error('封面未成功写入机会记录');
      ok++;
      console.log(`   ✅ ${String(row.title).slice(0, 30)} → ${coverUrl.slice(-50)}`);
    } catch (e) {
      fail++;
      console.log(`   ❌ 生成或回写失败 ${String(row.title).slice(0, 30)}: ${e.message.slice(0, 60)}`);
    }
    await wait(1500); // 限速，避免抓取/生图并发挤压
  }

  console.log(`\n📊 汇总: 回填成功 ${ok} / 失败 ${fail}`);
  if (fail) throw new Error(`封面回填失败 ${fail} 条 / 成功 ${ok} 条；原封面未清空`);
  if (prune) await pruneCovers();
  console.log('✅ 回填完成');
  return { ok, fail };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const clearArg = process.argv.find(a => a.startsWith('--clear='));
  const slugs = (clearArg ? clearArg.slice(8) : (process.env.BACKFILL_CLEAR || ''))
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!SUPABASE_URL || !SRK) throw new Error('缺少 Supabase 环境变量');
  runBackfill({
    slugs,
    force: process.argv.includes('--force') || process.env.BACKFILL_FORCE === '1',
    prune: process.argv.includes('--prune') || process.env.BACKFILL_PRUNE === '1',
  }).catch(e => { console.error('\n💥', e.message); process.exitCode = 1; });
}
