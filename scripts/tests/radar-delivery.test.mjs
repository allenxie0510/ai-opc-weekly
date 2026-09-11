import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('真实生成脚本：缺六问先重试、保留证据校验，最终写到后台draft而非只输出审计', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aiopc-delivery-test-'));
  const script = new URL('../generate-radar.mjs', import.meta.url).href;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module'], { cwd: dir, encoding: 'utf8', timeout: 20000,
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://test-db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-only', ZHIPU_API_KEY: 'test-only', EDITORIAL_RESEARCH_ENABLED: 'true', RADAR_DRY_RUN: 'false', GITHUB_STEP_SUMMARY: '' },
      input: `
import assert from 'node:assert/strict';
let calls = 0, delivered = 0;
const text = '面向国内商家的商品图设计服务，AI 生成商品背景图，设计师审核并按订单交付。作者自述已开始交付，但收入没有公开。';
const material = { source_url: 'https://example.com/synthetic-test', source_name: 'w2solo', title: '测试专用AI商品图设计服务', snippet: text, published_at: new Date().toISOString() };
const source = quote => ({ answer: quote, basis: 'source', quote });
const item = { source_url: material.source_url, source_name: 'w2solo', title: material.title, summary: '仅用于自动化测试的合成内容', editor_note: '我会先核查交付质量与成本，再判断可行性', evidence_quote: 'AI 生成商品背景图', company_scale: 'unknown',
 opc_value: { kind: 'delivery', audience_quote: '面向国内商家的商品图设计服务', workflow_quote: '设计师审核并按订单交付', next_action: '先找一家商家试做样图评估实际交付成本', limitation: '收入和实际效果未披露，需核查版权' },
 fit: { audience_relevance: 5, actionability: 4, evidence_strength: 4, solo_feasibility: 4, transferability: 4 },
 editorial_brief: { operating_market: 'domestic', market_quote: '面向国内商家的商品图设计服务', business_form: 'design', answers: {
 payer: { answer: '潜在付费对象为需要商品图的商家', basis: 'inference', quote: '' }, problem: source('面向国内商家的商品图设计服务'), ai_role: source('AI 生成商品背景图'),
 solo_delivery: { answer: '一人试做仍需人工审图和订单管理', basis: 'inference', quote: '' }, evidence: source('作者自述已开始交付'), risk: { answer: '版权与实际交付成本需要核查', basis: 'inference', quote: '' }
 } }
};
globalThis.fetch = async (input, init = {}) => {
 const url = new URL(String(input));
 if (url.hostname === 'open.bigmodel.cn') {
   calls++;
   const body = JSON.parse(init.body);
   assert.equal(body.response_format.type, 'json_object');
   assert.match(body.messages[1].content, /"editorial_brief":/);
   if (calls > 1) assert.match(body.messages[1].content, /校验反馈/);
   const { editorial_brief, ...old } = item;
   const repaired = { source_url: item.source_url, evidence_quote_id: 'q1', opc_value: { ...item.opc_value, audience_quote_id: 'q1', workflow_quote_id: 'q1' },
     editorial_brief: { ...editorial_brief, market_quote_id: 'q1', answers: Object.fromEntries(Object.entries(editorial_brief.answers).map(([key, field]) => [key, { ...field, quote_id: field.basis === 'source' ? 'q1' : '' }])) } };
   return Response.json({ choices: [{ message: { content: JSON.stringify({ items: [calls === 1 ? old : repaired], rejected: [] }) } }] });
 }
 assert.equal(url.hostname, 'test-db.example');
 if (init.method === 'POST') {
   assert.equal(url.pathname, '/rest/v1/radar_items');
   const rows = JSON.parse(init.body);
   assert.equal(rows.length, 1); assert.equal(rows[0].status, 'draft');
   assert.equal(rows[0].editorial_brief.version, 1); delivered++;
   return new Response(null, { status: 201 });
 }
 if (url.pathname.endsWith('/radar_candidates') && url.searchParams.get('offset') === '0') return Response.json([material]);
 return Response.json([]);
};
process.on('beforeExit', () => { assert.equal(calls, 2); assert.equal(delivered, 1); });
await import(${JSON.stringify(script)});
` });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /收录 1 条 → status = 'draft'/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
