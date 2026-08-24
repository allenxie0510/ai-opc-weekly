-- AI OPC 小红书选品雷达。仅存储已授权 Provider 或 Fixture 的规范化数据。
create table if not exists public.product_radar_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  mode text not null check (mode in ('fixture', 'live')),
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.product_opportunities (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  slug text not null unique,
  title text not null,
  category text not null,
  stage text not null check (stage in ('emerging', 'accelerating', 'breakout', 'crowded', 'declining')),
  score smallint not null check (score between 0 and 100),
  confidence smallint not null check (confidence between 0 and 100),
  evidence_grade text not null check (evidence_grade in ('A', 'B', 'C')),
  decision text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'blocked')),
  data_mode text not null check (data_mode in ('fixture', 'live')),
  data_as_of timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  run_id uuid references public.product_radar_runs(id) on delete set null,
  payload jsonb not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_signals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.product_opportunities(id) on delete cascade,
  external_id text not null,
  provider text not null,
  metric text not null,
  value jsonb not null,
  source_url text,
  captured_at timestamptz not null,
  raw_hash text,
  created_at timestamptz not null default now(),
  unique(provider, external_id)
);

create table if not exists public.product_trend_snapshots (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.product_opportunities(id) on delete cascade,
  provider text not null,
  snapshot_date date not null,
  normalized_interest smallint check (normalized_interest between 0 and 100),
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(opportunity_id, provider, snapshot_date)
);

create table if not exists public.supply_offers (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.product_opportunities(id) on delete cascade,
  external_id text not null,
  provider text not null,
  title text not null,
  offer_url text not null,
  unit_price numeric(12,2),
  min_order_quantity integer,
  one_piece_dropship boolean not null default false,
  shipping_estimate numeric(12,2),
  attributes jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(provider, external_id)
);

create table if not exists public.product_risks (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.product_opportunities(id) on delete cascade,
  external_id text not null,
  level text not null check (level in ('low', 'medium', 'high', 'blocked')),
  title text not null,
  detail text not null,
  mitigation text not null,
  source_url text,
  created_at timestamptz not null default now(),
  unique(opportunity_id, external_id)
);

create table if not exists public.product_score_configs (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  weights jsonb not null,
  risk_rules jsonb not null,
  decision_rules jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.product_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.product_opportunities(id) on delete cascade,
  status text not null default 'watching' check (status in ('watching', 'testing', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, opportunity_id)
);

create index if not exists product_opportunities_feed_idx on public.product_opportunities(status, score desc, data_as_of desc);
create index if not exists product_opportunities_category_idx on public.product_opportunities(category, stage);
create index if not exists product_signals_opportunity_idx on public.product_signals(opportunity_id, captured_at desc);
create index if not exists product_trend_snapshots_opportunity_idx on public.product_trend_snapshots(opportunity_id, snapshot_date desc);
create index if not exists supply_offers_opportunity_idx on public.supply_offers(opportunity_id, one_piece_dropship);

alter table public.product_radar_runs enable row level security;
alter table public.product_opportunities enable row level security;
alter table public.product_signals enable row level security;
alter table public.product_trend_snapshots enable row level security;
alter table public.supply_offers enable row level security;
alter table public.product_risks enable row level security;
alter table public.product_score_configs enable row level security;
alter table public.product_watchlist enable row level security;

drop policy if exists "published product opportunities are public" on public.product_opportunities;
create policy "published product opportunities are public" on public.product_opportunities for select using (status = 'published');
drop policy if exists "published product signals are public" on public.product_signals;
create policy "published product signals are public" on public.product_signals for select using (exists (select 1 from public.product_opportunities o where o.id = opportunity_id and o.status = 'published'));
drop policy if exists "published product trends are public" on public.product_trend_snapshots;
create policy "published product trends are public" on public.product_trend_snapshots for select using (exists (select 1 from public.product_opportunities o where o.id = opportunity_id and o.status = 'published'));
drop policy if exists "published supply offers are public" on public.supply_offers;
create policy "published supply offers are public" on public.supply_offers for select using (exists (select 1 from public.product_opportunities o where o.id = opportunity_id and o.status = 'published'));
drop policy if exists "published product risks are public" on public.product_risks;
create policy "published product risks are public" on public.product_risks for select using (exists (select 1 from public.product_opportunities o where o.id = opportunity_id and o.status = 'published'));
drop policy if exists "users manage own product watchlist" on public.product_watchlist;
create policy "users manage own product watchlist" on public.product_watchlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.product_score_configs(version, weights, risk_rules, decision_rules, active)
values (
  '1.0.0',
  '{"momentum":0.25,"contentability":0.20,"competitionGap":0.15,"supplyFit":0.15,"margin":0.15,"timing":0.10}'::jsonb,
  '{"maxPenalty":20,"blockedOverrides":true}'::jsonb,
  '{"85":"值得测试","75":"小规模测试","60":"保持关注","40":"谨慎进入","0":"暂不建议","lowConfidenceCap":"保持关注","evidenceCCap":"保持关注"}'::jsonb,
  true
) on conflict (version) do update set weights = excluded.weights, risk_rules = excluded.risk_rules, decision_rules = excluded.decision_rules, active = excluded.active;
