import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContentQuery } from '../../lib/admin-content';
import { createAdminSessionValue } from '../../lib/admin-session';
import { GET as content } from '../../app/api/admin/content/route';
import { GET as review } from '../../app/api/admin/review/route';
import { POST as publish } from '../../app/api/admin/publish/route';
import { POST as edit } from '../../app/api/admin/edit/route';
import { GET as pipeline } from '../../app/api/admin/pipeline/route';

async function isolated(run: (request: (path: string, body?: object) => Request) => Promise<void>, fetcher: typeof fetch) {
  const keys = ['ADMIN_PASSWORD', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const saved = keys.map(key => process.env[key]);
  const oldFetch = globalThis.fetch;
  process.env.ADMIN_PASSWORD = 'test-admin-workspace';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://admin-unit-test.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  globalThis.fetch = fetcher;
  try {
    await run((path, body) => new Request(`https://example.com${path}`, {
      headers: { cookie: `aiopc_admin_session=${createAdminSessionValue()}`, 'x-admin-token': 'test-admin-workspace', 'content-type': 'application/json' },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    }));
  } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
}

test('内容查询参数、分页边界和通配符转义', () => {
  assert.equal(parseContentQuery(new URLSearchParams())?.pageSize, 20);
  for (const query of ['type=invalid', 'page=0', 'page=1.2', 'page=10001', 'q=' + 'x'.repeat(101)]) assert.equal(parseContentQuery(new URLSearchParams(query)), null);
  assert.equal(parseContentQuery(new URLSearchParams({ q: '100%_AI' }))?.pattern, '%100\\%\\_AI%');
});

test('后台接口拒绝匿名用户且禁用缓存', async () => {
  for (const get of [content, review, pipeline]) {
    const result = await get(new Request('https://example.com/api/admin/content'));
    assert.equal(result.status, 401);
    assert.match(result.headers.get('cache-control') || '', /private, no-store/);
  }
});

test('后台执行成功但0新增不能冒充交付；接口不向前端泄露任务凭证', async () => {
  const saved = process.env.GITHUB_PAT;
  process.env.GITHUB_PAT = 'test-github-secret';
  try {
    await isolated(async request => {
      const response = await pipeline(request('/api/admin/pipeline'));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.pipelines[0].state, 'empty');
      assert.match(data.pipelines[0].message, /不代表推送成功/);
      assert.equal(JSON.stringify(data).includes('test-github-secret'), false);
    }, async input => {
      const url = new URL(String(input));
      if (url.hostname === 'api.github.com') return Response.json({ workflow_runs: [{ id: 1, status: 'completed', conclusion: 'success', run_started_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:05:00Z' }] });
      return new Response(null, { headers: { 'content-range': '*/0' } });
    });
  } finally { if (saved === undefined) delete process.env.GITHUB_PAT; else process.env.GITHUB_PAT = saved; }
});

test('取消重复任务不遮住实际生成任务，全部取消也不显示执行故障', async () => {
  const saved = process.env.GITHUB_PAT;
  process.env.GITHUB_PAT = 'test-github-secret';
  let activeStatus = 'in_progress';
  let onlyCancelled = false;
  try {
    await isolated(async request => {
      let data = await (await pipeline(request('/api/admin/pipeline'))).json();
      assert.equal(data.pipelines[0].runId, 1);
      assert.equal(data.pipelines[0].state, 'running');
      activeStatus = 'completed';
      data = await (await pipeline(request('/api/admin/pipeline'))).json();
      assert.equal(data.pipelines[0].runId, 1);
      assert.equal(data.pipelines[0].state, 'delivered');
      onlyCancelled = true;
      data = await (await pipeline(request('/api/admin/pipeline'))).json();
      assert.equal(data.pipelines[0].state, 'cancelled');
    }, async input => {
      const url = new URL(String(input));
      if (url.hostname === 'api.github.com') return Response.json({ workflow_runs: [
        { id: 2, status: 'completed', conclusion: 'cancelled', run_started_at: '2026-09-12T00:01:00Z' },
        ...(onlyCancelled ? [] : [{ id: 1, status: activeStatus, conclusion: activeStatus === 'completed' ? 'success' : null, run_started_at: '2026-09-12T00:00:00Z', updated_at: '2026-09-12T00:05:00Z' }]),
      ] });
      return new Response(null, { headers: { 'content-range': '*/1' } });
    });
  } finally { if (saved === undefined) delete process.env.GITHUB_PAT; else process.env.GITHUB_PAT = saved; }
});

test('已发布搜索使用数据库全历史分页、准确总数与参数转义', async () => {
  await isolated(async request => {
    const result = await content(request('/api/admin/content?type=radar&page=2&q=100%25'));
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.total, 41);
    assert.equal(data.page, 2);
    assert.equal(data.rows.length, 20);
  }, async input => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'admin-unit-test.example');
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(url.searchParams.get('title'), 'ilike.%100\\%%');
    assert.equal(url.searchParams.get('offset'), '20');
    assert.equal(url.searchParams.get('limit'), '20');
    assert.equal(url.searchParams.has('published_at'), false);
    return Response.json(Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: '历史内容' })), { headers: { 'content-range': '20-39/41' } });
  });
});

test('待审不受 30 天限制、超过数据库单页仍完整返回，周报带条目', async () => {
  await isolated(async request => {
    const result = await review(request('/api/admin/review'));
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.radarDrafts.length, 1001);
    assert.equal(data.radarDrafts[0].published_at, '2026-01-01');
    assert.equal(data.weeklyDrafts[0].items[0].id, 'item-1');
    assert.equal('opportunityPublished' in data, false);
  }, async input => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get('offset'));
    if (url.searchParams.get('status') === 'eq.rejected') {
      assert.match(url.searchParams.get('published_at') || '', /^gte\./);
      return Response.json([]);
    }
    assert.equal(url.searchParams.has('published_at'), false);
    if (url.pathname.endsWith('/radar_items')) return Response.json(offset === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: String(i), published_at: '2026-01-01' })) : offset === 1000 ? [{ id: '1000' }] : []);
    if (url.pathname.endsWith('/weekly_issues')) return Response.json(offset ? [] : [{ id: 'weekly-1' }]);
    if (url.pathname.endsWith('/news_items')) return Response.json(offset ? [] : [{ id: 'item-1', title: '真实来源' }]);
    return Response.json([]);
  });
});

test('已发布周报返回全部关联条目，读取失败不能伪装空列表', async () => {
  await isolated(async request => {
    const data = await (await content(request('/api/admin/content?type=weekly'))).json();
    assert.equal(data.rows[0].items.length, 2);
  }, async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/weekly_issues')) return Response.json([{ id: 'w1' }], { headers: { 'content-range': '0-0/1' } });
    return Response.json(url.searchParams.get('offset') === '0' ? [{ id: 'i1', weekly_issue_id: 'w1' }, { id: 'i2', weekly_issue_id: 'w1' }] : []);
  });
  await isolated(async request => {
    assert.equal((await content(request('/api/admin/content'))).status, 503);
    assert.equal((await review(request('/api/admin/review'))).status, 503);
  }, async () => Response.json({ message: 'database unavailable' }, { status: 400 }));
});

test('推荐操作不能误删非机会内容', async () => {
  await isolated(async request => {
    for (const type of ['radar', 'weekly']) assert.equal((await publish(request('/api/admin/publish', { type, action: 'feature', ids: ['id'] }))).status, 400);
  }, async () => { throw new Error('invalid action must never reach database'); });
});

test('已发布信号允许明确删除；编辑返回真实影响数', async () => {
  await isolated(async request => {
    const result = await publish(request('/api/admin/publish', { type: 'radar', action: 'discard', ids: ['r1'] }));
    assert.equal((await result.json()).affected, 1);
    assert.equal((await (await edit(request('/api/admin/edit', { type: 'radar', id: 'missing', fields: { title: '修改标题' } }))).json()).affected, 0);
  }, async (input, init) => {
    const url = new URL(String(input));
    assert.match(url.searchParams.get('status') || '', /published/);
    if (init?.method === 'DELETE') {
      assert.equal(url.searchParams.get('id'), 'in.(r1)');
      return new Response(null, { status: 204, headers: { 'content-range': '*/1' } });
    }
    return Response.json([]);
  });
});

test('整期删除：子条目失败停止删除父记录；不存在的记录不虚报成功', async () => {
  let parentDeletes = 0;
  await isolated(async request => {
    assert.equal((await publish(request('/api/admin/publish', { type: 'weekly', action: 'discard', ids: ['w1'] }))).status, 500);
    assert.equal(parentDeletes, 0);
  }, async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/news_items')) return Response.json({ message: 'child delete failed' }, { status: 400 });
    if (init?.method === 'DELETE') parentDeletes++;
    return Response.json({ id: 'w1' });
  });
  await isolated(async request => {
    assert.equal((await (await publish(request('/api/admin/publish', { type: 'weekly', action: 'discard', ids: ['missing'] }))).json()).affected, 0);
  }, async () => Response.json([]));
});
