import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GET, POST } from '../../app/api/admin/research/route';
import { POST as publish } from '../../app/api/admin/publish/route';
import { EditorialBrief } from '../../components/editorial-brief';
import { validateEditorialBrief } from '../../lib/editorial-policy.mjs';

async function environment(run: () => Promise<void>, fetcher: typeof fetch) {
  const keys = ['ADMIN_PASSWORD', 'EDITORIAL_RESEARCH_ENABLED', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const before = keys.map(k => process.env[k]);
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { ADMIN_PASSWORD: 'test-only', EDITORIAL_RESEARCH_ENABLED: 'true', NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only-not-real' });
  globalThis.fetch = fetcher;
  try { await run(); } finally { globalThis.fetch = originalFetch; keys.forEach((k, i) => { if (before[i] === undefined) delete process.env[k]; else process.env[k] = before[i]; }); }
}
const request = (body?: object) => new Request('https://example.test/api/admin/research', { headers: { 'x-admin-token': 'test-only', 'content-type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
test('匿名和普通用户不能读取研究线索或写入；返回禁止缓存', async () => {
  await environment(async () => {
    for (const handler of [GET, POST]) {
      const res = await handler(new Request('https://example.test/api/admin/research'));
      assert.equal(res.status, 401);
      assert.match(res.headers.get('Cache-Control') || '', /private, no-store/);
    }
  }, async () => { throw new Error('anonymous requests must not access the database'); });
});
test('开关关闭不访问缺失的新表', async () => {
  await environment(async () => {
    process.env.EDITORIAL_RESEARCH_ENABLED = 'false';
    assert.equal((await GET(request())).status, 503);
  }, async () => { throw new Error('disabled feature must not query database'); });
});
test('内部线索与确认核实的证据分别存储，不信任客户端status或verified_at', async () => {
  const writes: Record<string, unknown>[] = [];
  await environment(async () => {
    const res = await POST(request({ title: '测试项目', lead_url: 'https://scys.com/post/1', rights_basis: 'public-source', research_question: '寻找公开的AI交付案例', status: 'verified', verified_at: '2000-01-01' }));
    assert.equal(res.status, 200);
    assert.equal(writes[0].status, 'lead');
    assert.equal(writes[0].verified_at, null);
    assert.equal(writes[0].excerpt, '');
  }, async (_input, init) => { writes.push(JSON.parse(String(init?.body))); return Response.json([{ id: 'test-id' }]); });
});
test('发布缺失六问的草稿被阻止，无法靠批量发布绕过', async () => {
  await environment(async () => {
    for (const type of ['radar', 'weekly']) assert.equal((await publish(request({ type, action: 'publish', ids: ['id'] }))).status, 409);
  }, async (_input, init) => {
    assert.notEqual(init?.method, 'PATCH');
    return Response.json([{ id: 'id', editorial_brief: null }]);
  });
});
test('六问默认折叠、可访问原始来源，HTML不会带内部授权记录', () => {
  const quote = '面向国内商家的 AI 商品图设计服务';
  const data = validateEditorialBrief({ operating_market: 'domestic', market_quote: quote, business_form: 'design', answers: Object.fromEntries(['payer', 'problem', 'ai_role', 'solo_delivery', 'evidence', 'risk'].map(key => [key, { answer: quote, basis: 'source', quote }])) }, { title: '测试', snippet: quote, source_url: 'https://example.com/public', permission_note: 'DO-NOT-DISCLOSE' });
  assert.equal(data.ok, true);
  const html = renderToStaticMarkup(React.createElement(EditorialBrief, { brief: data.brief }));
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /open=""|DO-NOT-DISCLOSE/);
  for (const label of ['国内经营', '设计服务', '谁付钱', '解决什么问题', 'AI 起什么作用', '一人能否交付', '证据是什么', '风险在哪里']) assert.ok(html.includes(label));
});
