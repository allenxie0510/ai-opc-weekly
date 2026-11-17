-- P1: private analytics/feedback and weekly references. Existing content is retained.
create table if not exists public.news_briefs (
 id uuid primary key default gen_random_uuid(), slug text not null unique,
 title text not null check(length(title) between 1 and 180), summary text not null default '' check(length(summary)<=1200),
 item_ids uuid[] not null default '{}', status text not null default 'draft' check(status in ('draft','published')),
 version integer not null default 1, published_at timestamptz, created_at timestamptz not null default now(),
 check(cardinality(item_ids)<=30)
);
alter table public.news_briefs enable row level security;
revoke all on public.news_briefs from public,anon,authenticated;
grant all on public.news_briefs to service_role;
create table if not exists public.reading_events (
 id bigint generated always as identity primary key, visitor_id uuid not null,
 kind text not null check(kind in ('visit','impression','read','source_click','share','filter')),
 content_id text not null, source text not null default '', lane text not null default 'other',
 channel text not null default 'direct' check(channel in ('direct','wechat','share','rss','weekly')),
 dedupe_key text not null unique, occurred_at timestamptz not null default now()
);
create index if not exists reading_events_time on public.reading_events(occurred_at,id);
alter table public.reading_events enable row level security;
revoke all on public.reading_events from public,anon,authenticated;
grant all on public.reading_events to service_role;
grant usage,select on sequence public.reading_events_id_seq to service_role;
create table if not exists public.reading_feedback (
 visitor_id uuid not null, content_id text not null, source text not null, lane text not null,
 value text not null check(value in ('useful','neutral','irrelevant')), updated_at timestamptz not null default now(),
 primary key(visitor_id,content_id)
);
alter table public.reading_feedback enable row level security;
revoke all on public.reading_feedback from public,anon,authenticated;
grant all on public.reading_feedback to service_role;
