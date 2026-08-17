-- 方向探测器：匿名用户状态存储（无账号系统）
-- user_id = 客户端生成的匿名标识（localStorage 中的 ai_opc_uid）
-- 开启 RLS 且不建策略：默认拒绝 anon 访问，仅服务端 SERVICE_ROLE 可读写
create table if not exists explore_state (
  user_id text primary key,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table explore_state enable row level security;
