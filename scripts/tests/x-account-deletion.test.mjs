import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../../app/api/admin/accounts/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../app/x/page.tsx', import.meta.url), 'utf8');
const data = readFileSync(new URL('../../lib/data.ts', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../../supabase/migrations/20260902110000_x_account_cascade.sql', import.meta.url),
  'utf8',
);

test('X timeline is never served from a stale ISR snapshot', () => {
  assert.match(page, /export const dynamic = 'force-dynamic'/);
  assert.match(page, /export const revalidate = 0/);
  assert.doesNotMatch(page, /export const revalidate = 300/);
  assert.match(page, /authors: accounts\.map/);
  assert.match(data, /q\.in\('author_username', options\.authors\)/);
});

test('account deletion invalidates timeline and reports hard-deleted tweets', () => {
  assert.match(route, /delete_twitter_account_with_tweets/);
  assert.match(route, /revalidatePath\('\/x'\)/);
  assert.match(route, /deleted_tweets/);
});

test('database blocks orphan writes and cascades direct account deletion', () => {
  assert.match(migration, /before insert or update of author_username on public\.tweets/i);
  assert.match(migration, /for key share/i);
  assert.match(migration, /before delete on public\.twitter_accounts/i);
  assert.match(migration, /delete from public\.tweets[\s\S]*lower\(author_username\)/i);
  assert.match(migration, /where not exists/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i);
});
