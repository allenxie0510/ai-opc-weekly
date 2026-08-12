-- ═══════════════════════════════════════════════════════════════
-- AI OPC · Decision Engine 迁移 002 · Score 历史追踪（P3 飞轮第一块）
-- 在 Supabase → SQL Editor 整段执行（幂等，可重复执行）
--
-- 用途：每条机会的评分从静态数字变成有时间维度的证据链。
--   初评（source='initial'）由机会生产线落库；
--   周度复评（source='weekly-rescore'）由 rescore-opportunities.mjs 落库；
--   手动复评（source='manual'）同脚本 RESCORE_SOURCE=manual。
-- 分数量纲：0–10 一位小数（opportunities.score_total 是 0–100，
--   落 history 时除以 10；复评 GLM 直接输出 1–10）。
-- ═══════════════════════════════════════════════════════════════

-- ─── opportunity_score_history：评分轨迹 ─────────────────────
create table if not exists opportunity_score_history (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  score           numeric(3,1) not null,        -- 0–10 一位小数
  signal_count    int not null default 0,       -- 本次评分依据的新信号数（初评=证据数）
  reason          text,                          -- GLM 一句话评分理由
  source          text not null,                 -- initial / weekly-rescore / manual
  created_at      timestamptz not null default now()
);

create index if not exists idx_opp_score_history_opp_time
  on opportunity_score_history (opportunity_id, created_at desc);

-- ─── RLS：公开读 published 机会的轨迹；写入一律走 service role（绕过 RLS）───
alter table opportunity_score_history enable row level security;
drop policy if exists "anon read published score history" on opportunity_score_history;
create policy "anon read published score history"
  on opportunity_score_history for select to anon
  using (exists (
    select 1 from opportunities
    where opportunities.id = opportunity_score_history.opportunity_id
      and opportunities.status = 'published'
  ));

-- ═══ 验证：执行完应返回 opportunity_score_history ───
-- select table_name from information_schema.tables
-- where table_name = 'opportunity_score_history';
