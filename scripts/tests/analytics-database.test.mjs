import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

test('PostgreSQL migration: idempotency, registration trigger, atomic totals, RLS and grants', { skip: !process.env.ANALYTICS_PGLITE_PATH }, async () => {
  const { PGlite } = createRequire(import.meta.url)(process.env.ANALYTICS_PGLITE_PATH);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
      create table public.page_views(key text primary key, count integer default 0);
      insert into public.page_views values ('total',1301);
      create table public.page_views_log(id serial primary key, uid text, date text);
      create function public.increment_view_count() returns void language sql as 'select';
      grant all on public.page_views, public.page_views_log to anon, authenticated;
      insert into auth.users values ('00000000-0000-4000-8000-000000000001','2026-09-01T00:00:00Z'), ('00000000-0000-4000-8000-000000000002',null);`);
    const sql = readFileSync(new URL('../../supabase/migrations/20260907140000_admin_analytics.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    const scalar = async (query) => (await db.query(query)).rows[0].n;
    assert.equal(await scalar('select count(*)::int n from public.analytics_events'), 1);
    assert.equal(await scalar("select count n from public.page_views where key='total'"), 1301);
    await db.exec("update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-000000000002'");
    assert.equal(await scalar('select count(*)::int n from public.analytics_events'), 2);
    const visit = "insert into public.analytics_events(kind,visitor_id,dedupe_key) values ('visit','00000000-0000-4000-8000-000000000003','visit:day1') on conflict(dedupe_key) do nothing";
    await db.exec(visit); await db.exec(visit);
    assert.equal(await scalar("select count n from public.page_views where key='total'"), 1302);
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['analytics_events', 'analytics_settings', 'page_views', 'page_views_log']) {
        assert.equal(await scalar(`select has_table_privilege('${role}','public.${table}','SELECT') n`), false);
        assert.equal(await scalar(`select has_table_privilege('${role}','public.${table}','INSERT') n`), false);
      }
      assert.equal(await scalar(`select has_function_privilege('${role}','public.increment_view_count()','EXECUTE') n`), false);
    }
    await db.exec('set role service_role');
    assert.equal(await scalar('select count(*)::int n from public.analytics_events'), 3);
  } finally { await db.close(); }
});
