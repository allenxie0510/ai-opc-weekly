/**
 * AI OPC · 机会封面回填脚本（按需手动执行）
 * 为 opportunities 表中 cover_url 为空的 draft/published 机会
 * 走与生产线 Stage 4 相同的 CogView 生成 + Supabase Storage 上传逻辑，回写 cover_url
 *
 * 用法：node scripts/backfill-covers.mjs
 * 由 GitHub Actions 手动触发（backfill-covers.yml，workflow_dispatch）
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ZHIPU_API_KEY
 * 前置条件：opportunities 表已有 cover_url 列
 *   alter table opportunities add column if not exists cover_url text;
 */

import { generateOpportunityCover } from './lib/cover.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZK = process.env.ZHIPU_API_KEY;

if (!SUPABASE_URL) { console.error('❌ 缺少 NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }
if (!SRK) { console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!ZK) { console.error('❌ 缺少 ZHIPU_API_KEY'); process.exit(1); }

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...opts,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SB ${res.status}: ${txt.slice(0, 200)}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🎨 AI OPC · 机会封面回填\n');

  let rows;
  try {
    rows = await sb(
      `/opportunities?select=id,slug,title,thesis,category&cover_url=is.null&status=in.(draft,published)&order=published_at.desc&limit=50`
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
  if (!rows || rows.length === 0) { console.log('✅ 无需回填'); return; }

  let ok = 0, fail = 0;
  for (const row of rows) {
    const coverUrl = await generateOpportunityCover(row);
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
    await sleep(1500); // 限速，避免 CogView 并发挤压
  }

  console.log(`\n📊 汇总: 回填成功 ${ok} / 失败 ${fail}`);
  console.log('✅ 回填完成');
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });
