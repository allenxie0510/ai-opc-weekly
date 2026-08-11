-- ═══════════════════════════════════════════════════════════════
-- AI OPC · Decision Engine 迁移 001
-- 在 Supabase → SQL Editor 整段执行（幂等，可重复执行）
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. radar_items：Signal 语义升级 ──────────────────────────
alter table radar_items add column if not exists signal_type text;   -- product/launch/funding/m-and-a/model/policy/metric
alter table radar_items add column if not exists source_tier text;   -- S/A/B/C/D

-- ─── 2. news_items：可信度字段（周报数字出处）──────────────────
alter table news_items add column if not exists revenue_type text;        -- founder_disclosed / ai_estimate / undisclosed
alter table news_items add column if not exists revenue_source_url text;
alter table news_items add column if not exists claim_quote text;         -- 支撑数字的原文摘录

-- ─── 3. opportunities：核心资产 ────────────────────────────────
create table if not exists opportunities (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  title             text not null,
  thesis            text,                    -- 一句话机会论断

  -- 叙述层
  why_now           text,
  customer          text,
  pain              text,
  who_pays          text,
  business_model    text,
  pricing_hint      text,
  mvp_weeks         text,
  distribution      text,
  competition       text,
  platform_risk     text,
  bull_case         text,
  bear_case         text,
  mvp_wedge         text,
  first_10_customers text,

  -- 评分层（七维 0–100 + 加权总分）
  score_total         int,
  score_demand        int,
  score_solo_fit      int,
  score_monetization  int,
  score_distribution  int,
  score_timing        int,
  score_defensibility int,
  score_operating     int,
  evidence_grade    text,                    -- A/B/C/D

  -- 决策层
  recommendation    text,                    -- BUILD / WATCH / NICHE_ONLY / SKIP
  timing            text,                    -- early / right-time / late
  validation_plan   jsonb,                   -- { hypothesis, steps[], success_threshold, kill_condition }
  evidence          jsonb,                   -- [{ claim, source_name, source_url, quote, tier }]

  -- 编辑人格层
  editor_conviction text,                    -- high / medium / low
  editor_take       text,

  -- 关系层
  category          text,
  signal_ids        jsonb,                   -- uuid 数组
  case_ids          jsonb,                   -- uuid 数组

  -- 飞轮（P3 用，先建列）
  score_history     jsonb,
  outcome           text,

  -- 状态与时间
  status            text not null default 'draft',   -- draft / published / archived
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_opportunities_status_pub
  on opportunities (status, published_at desc);

-- ─── 4. cases：真实一人公司案例 ────────────────────────────────
create table if not exists cases (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  url                text,
  founder            text,
  team_size          text,
  mrr                text,
  arr                text,
  revenue_type       text,                   -- founder_disclosed / ai_estimate / undisclosed
  revenue_source_url text,
  claim_quote        text,
  pricing            text,
  growth             text,
  distribution       text,
  tech_stack         text,
  launch_channel     text,
  source_name        text,
  source_tier        text,
  created_at         timestamptz not null default now()
);

-- ─── 5. RLS：anon 只读已发布内容，写入走 service role ─────────
alter table opportunities enable row level security;
drop policy if exists "anon read published opportunities" on opportunities;
create policy "anon read published opportunities"
  on opportunities for select to anon
  using (status = 'published');

alter table cases enable row level security;
drop policy if exists "anon read cases" on cases;
create policy "anon read cases"
  on cases for select to anon
  using (true);

-- ═══ 验证：执行完应返回 2 ───
-- select count(*) from information_schema.tables
-- where table_name in ('opportunities','cases');
