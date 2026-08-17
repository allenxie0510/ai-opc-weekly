-- 方向探测器：登录用户的「探索会话」（多次探索）
-- 一个用户可保存多组探索；user_id 关联 Supabase Auth 用户
create table if not exists explore_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '未命名探索',
  profile jsonb not null default '{}'::jsonb,
  weights jsonb not null default '{}'::jsonb,
  opportunities jsonb not null default '[]'::jsonb,
  plans jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists explore_sessions_user_idx on explore_sessions (user_id, updated_at desc);

alter table explore_sessions enable row level security;

-- 仅本人可读写自己的探索（服务端用 SERVICE_ROLE 也可绕过，此为兜底防线）
drop policy if exists "own explore sessions" on explore_sessions;
create policy "own explore sessions" on explore_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
