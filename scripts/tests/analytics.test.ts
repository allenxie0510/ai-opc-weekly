import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsDay, analyticsStart, buildAnalytics, conversionFunnel, metricTotals, type AnalyticsEvent } from '../../lib/analytics';
import { analyticsVisitor, visitorCookie, isUuid, recordSavedResult } from '../../lib/analytics-server';
import { createAdminSessionValue } from '../../lib/admin-session';
import { GET as overview } from '../../app/api/admin/analytics/route';
import { GET as views, POST as oldWrite } from '../../app/api/views/route';
import { POST as event } from '../../app/api/analytics/events/route';

function e(kind: AnalyticsEvent['kind'], minute: number, visitor: string | null = 'v1', user: string | null = null): AnalyticsEvent {
  return { kind, visitor_id: visitor, user_id: user, object_id: null, occurred_at: new Date(Date.parse('2026-09-07T01:00:00Z') + minute * 60000).toISOString() };
}
test('北京时间日期、月界和滚动窗口', () => {
  assert.equal(analyticsDay('2026-08-31T15:59:59Z'), '2026-08-31');
  assert.equal(analyticsDay('2026-08-31T16:00:00Z'), '2026-09-01');
  assert.equal(analyticsStart(7, Date.parse('2026-09-07T12:00Z')), '2026-08-31T16:00:00.000Z');
});
test('活跃、访客按周期去重，完成与保存分离', () => {
  const rows = [e('visit', 0), e('visit', 1), e('active', 2, 'v1', 'u1'), e('active', 3, 'v2', 'u1'), e('research_completed', 4, 'v1', 'u1'), e('research_completed', 5, 'v1', 'u1')];
  assert.deepEqual(metricTotals(rows), { visitors: 1, registrations: 0, activeUsers: 1, completions: 2, savers: 0 });
});
test('匿名阅读→注册→跨设备完成→保存，严格时间顺序', () => {
  const rows = [e('visit', 0), e('opportunity_read', 1), e('registered', 2, null, 'u1'), e('active', 3, 'v1', 'u1'), e('research_completed', 4, 'v2', 'u1'), e('result_saved', 5, 'v2', 'u1')];
  assert.deepEqual(conversionFunnel(rows), [1, 1, 1, 1, 1]);
  assert.deepEqual(conversionFunnel(rows.map(r => r.kind === 'registered' ? e('registered', -1, null, 'u1') : r)), [1, 1, 0, 0, 0]);
  assert.deepEqual(conversionFunnel(rows.map(r => r.kind === 'result_saved' ? e('result_saved', 3, 'v2', 'u1') : r)), [1, 1, 1, 1, 0]);
});
test('共享浏览器不能把不同账号的研究与保存拼接', () => {
  const rows = [e('visit', 0), e('opportunity_read', 1), e('registered', 2, null, 'u1'), e('active', 3, 'v1', 'u1'), e('research_completed', 4, 'v1', 'u2'), e('result_saved', 5, 'v1', 'u2')];
  assert.deepEqual(conversionFunnel(rows), [1, 1, 1, 0, 0]);
});
test('缺失历史有覆盖标记，注册可回填；忽略未来并统一时区格式', () => {
  const now = Date.parse('2026-09-07T12:00:00Z');
  const rows = [e('visit', 0), { ...e('registered', 0, null, 'u1'), occurred_at: '2026-09-01T12:00:00+00:00' }, { ...e('visit', 0, 'future'), occurred_at: '2026-09-09T12:00:00Z' }];
  const result = buildAnalytics(rows, '2026-09-07T00:00:00Z', now);
  assert.equal(result.days.length, 30);
  assert.equal(result.today.visitors, 1);
  assert.equal(result.days[23].covered, false);
  assert.equal(result.periods[0].totals.registrations, 1);
});
test('统计接口必须有签名管理员 Cookie，旧接口不再泄露或写入', async () => {
  for (const get of [overview, views]) {
    const response = await get(new Request('https://example.com/api/admin/analytics', { headers: { 'x-admin-token': 'not-a-session' } }));
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert.equal('count' in await response.json(), false);
  }
  assert.equal((await oldWrite()).status, 410);
});
test('访问标识有签名，不能伪造；已登录管理员不计入行为', async () => {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'test-only-password';
  try {
    const id = '52d18c9b-e67f-4d87-b026-01db701833b2';
    assert.ok(isUuid(id));
    assert.equal(analyticsVisitor(new Request('https://example.com', { headers: { cookie: visitorCookie(id) } })), id);
    assert.equal(analyticsVisitor(new Request('https://example.com', { headers: { cookie: `aiopc_visitor=${id}.fake` } })), null);
    const r = await event(new Request('https://example.com/api/analytics/events', { method: 'POST', headers: { origin: 'https://example.com', cookie: `aiopc_admin_session=${createAdminSessionValue()}` }, body: JSON.stringify({ kind: 'visit' }) }));
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('set-cookie'), null);
  } finally { if (previous === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previous; }
});
test('拒绝跨站、伪造注册/支付、无登录完成事件；尊重 DNT', async () => {
  const request = (kind: string, headers = {}) => new Request('https://example.com/api/analytics/events', { method: 'POST', headers: { origin: 'https://example.com', ...headers }, body: JSON.stringify({ kind }) });
  assert.equal((await event(request('visit', { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await event(request('registered'))).status, 400);
  assert.equal((await event(request('payment_completed'))).status, 400);
  assert.ok([401, 503].includes((await event(request('research_completed'))).status));
  assert.equal((await event(request('visit', { dnt: '1' }))).status, 204);
});

test('服务端绑定真实用户，完成去重键固定，演示和空保存不记录结果', async () => {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFetch = globalThis.fetch;
  const writes: Record<string, unknown>[] = [];
  const userId = '00000000-0000-4000-8000-000000000001';
  const completionId = '00000000-0000-4000-8000-000000000002';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://analytics-unit-test.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-test-service-key';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: userId, email_confirmed_at: '2026-09-01T00:00:00Z' });
    if (url.includes('/rest/v1/analytics_events')) {
      writes.push(JSON.parse(String(init?.body)));
      return Response.json([]);
    }
    throw new Error('Unexpected test request');
  };
  try {
    const request = () => new Request('https://example.com/api/analytics/events', { method: 'POST', headers: { origin: 'https://example.com', authorization: 'Bearer test-user-token' }, body: JSON.stringify({ kind: 'research_completed', objectId: completionId, source: 'server', userId: 'forged-user' }) });
    assert.equal((await event(request())).status, 204);
    assert.equal((await event(request())).status, 204);
    const completions = writes.filter(row => row.kind === 'research_completed');
    assert.equal(completions.length, 2);
    assert.equal(completions[0].user_id, userId);
    assert.equal(completions[0].dedupe_key, completions[1].dedupe_key);
    writes.length = 0;
    const req = new Request('https://example.com');
    await recordSavedResult(req, userId, { id: 's1', plans: {} });
    await recordSavedResult(req, userId, { id: 's1', plans: { p: { firstStep: 'Demo' } } });
    assert.equal(writes.length, 0);
    await recordSavedResult(req, userId, { id: 's1', plans: { p: { firstStep: 'Validate demand', analyticsCompletionId: completionId, analyticsSource: 'server' } } });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].kind, 'result_saved');
  } finally {
    globalThis.fetch = oldFetch;
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});
