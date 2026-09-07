-- Run in Supabase SQL Editor as database owner. Additive; no historical rows deleted.
begin;
create table if not exists public.analytics_settings (
  id boolean primary key default true check (id), started_at timestamptz not null default now()
);
insert into public.analytics_settings(id) values (true) on conflict do nothing;
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('visit','opportunity_read','registered','active','research_completed','result_saved','payment_completed')),
  visitor_id uuid,
  user_id uuid references auth.users(id) on delete cascade,
  object_id text check (length(object_id) <= 200),
  dedupe_key text not null unique check (length(dedupe_key) <= 500),
  occurred_at timestamptz not null default now(),
  check (visitor_id is not null or user_id is not null)
);
create index if not exists analytics_events_time on public.analytics_events(occurred_at, id);
create index if not exists analytics_events_user on public.analytics_events(user_id, occurred_at);
alter table public.analytics_events enable row level security;
alter table public.analytics_settings enable row level security;
revoke all on public.analytics_events, public.analytics_settings from public, anon, authenticated;
revoke all on sequence public.analytics_events_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_events to service_role;
grant usage, select on sequence public.analytics_events_id_seq to service_role;
grant select on public.analytics_settings to service_role;

-- Preserve the legacy total, but remove public read/write access.
create table if not exists public.page_views (key text primary key, count integer default 0);
insert into public.page_views(key, count) values ('total', 0) on conflict do nothing;
alter table public.page_views enable row level security;
revoke all on public.page_views from public, anon, authenticated;
grant select, insert, update on public.page_views to service_role;
do $$ begin
  if to_regclass('public.page_views_log') is not null then
    alter table public.page_views_log enable row level security;
    revoke all on public.page_views_log from public, anon, authenticated;
  end if;
  if to_regprocedure('public.increment_view_count()') is not null then
    revoke all on function public.increment_view_count() from public, anon, authenticated;
  end if;
end $$;

create or replace function public.analytics_increment_legacy_total()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'visit' then
    insert into public.page_views(key, count) values ('total', 1)
    on conflict(key) do update set count = public.page_views.count + 1;
  end if;
  return new;
end $$;
revoke all on function public.analytics_increment_legacy_total() from public, anon, authenticated;
drop trigger if exists analytics_legacy_total on public.analytics_events;
create trigger analytics_legacy_total after insert on public.analytics_events
for each row execute function public.analytics_increment_legacy_total();

-- First email verification, not the unverified OTP request, defines registration.
create or replace function public.analytics_verified_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    insert into public.analytics_events(kind, user_id, dedupe_key, occurred_at)
    values ('registered', new.id, 'registered:' || new.id::text, new.email_confirmed_at)
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.analytics_verified_registration() from public, anon, authenticated;
drop trigger if exists analytics_registration on auth.users;
create trigger analytics_registration after insert or update of email_confirmed_at on auth.users
for each row execute function public.analytics_verified_registration();
insert into public.analytics_events(kind, user_id, dedupe_key, occurred_at)
select 'registered', id, 'registered:' || id::text, email_confirmed_at
from auth.users where email_confirmed_at is not null
on conflict(dedupe_key) do nothing;
commit;
