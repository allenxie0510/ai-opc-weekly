import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { validateEditorialBrief, publishableBrief } from '../../lib/editorial-policy.mjs';

test('真实 PostgreSQL 触发器：短中文答案规范化后雷达、周报均可入库及发布；空答案仍拒绝', async () => {
  // Synthetic only; runs locally in PostgreSQL/WASM, never touches Supabase.
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.radar_items(id serial primary key, status text default 'draft');
      create table public.news_items(id serial primary key, status text default 'draft');`);
    const sql = readFileSync(new URL('../../supabase/migrations/20260910_editorial_research.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    const quote = '测试专用：AI 帮助商家生成商品图，由人工审核后交付';
    const material = { title: '合成测试，不是真实项目', snippet: quote, source_url: 'https://example.com/test-only' };
    for (const table of ['radar_items', 'news_items']) {
      const raw = { operating_market: 'unknown', market_quote: '', business_form: 'design',
        answers: Object.fromEntries(['payer', 'problem', 'ai_role', 'solo_delivery', 'evidence', 'risk'].map(key => [key, { answer: quote, basis: 'source', quote }])) };
      raw.answers.payer = { answer: '开发者', basis: 'inference', quote: '' };
      raw.answers.solo_delivery = { answer: '未披露', basis: 'inference', quote: '' };
      raw.answers.risk = { answer: '未披露', basis: 'unknown', quote: '' };
      const legacy = { ...raw, source_url: material.source_url, rights_basis: 'public-source' };
      await assert.rejects(db.query(`insert into public.${table}(editorial_brief) values ($1)`, [legacy]), /Missing editorial answer: payer/);
      const checked = validateEditorialBrief(raw, material);
      assert.equal(checked.ok, true);
      assert.equal(publishableBrief(checked.brief), true);
      const saved = await db.query(`insert into public.${table}(editorial_brief) values ($1) returning id, editorial_brief`, [checked.brief]);
      const record = saved.rows[0];
      assert.equal(record.editorial_brief.answers.payer.answer, '潜在付费对象：开发者');
      assert.deepEqual(record.editorial_brief.answers.solo_delivery, { answer: '尚未披露', basis: 'unknown', quote: '' });
      await db.query(`update public.${table} set status='published' where id=$1`, [record.id]);
      const invalid = structuredClone(checked.brief); invalid.answers.payer.answer = '';
      await assert.rejects(db.query(`insert into public.${table}(editorial_brief) values ($1)`, [invalid]), /Missing editorial answer: payer/);
    }
  } finally { await db.close(); }
});
