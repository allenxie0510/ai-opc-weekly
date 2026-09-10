-- Run once in Supabase SQL Editor, then enable EDITORIAL_RESEARCH_ENABLED.
begin;
alter table public.radar_items add column if not exists editorial_brief jsonb;
alter table public.news_items add column if not exists editorial_brief jsonb;

-- Internal leads contain URLs + our research question, NOT member-only post text.
-- Verified excerpts must be independently public or specifically authorized.
create table if not exists public.editorial_research (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 2 and 200),
  lead_url text not null default '',
  research_question text not null default '' check (length(research_question) <= 600),
  source_url text not null default '',
  excerpt text not null default '' check (length(excerpt) <= 1600),
  rights_basis text not null default 'public-source' check (rights_basis in ('public-source','author-permission')),
  permission_note text not null default '',
  status text not null default 'lead' check (status in ('lead','verified','drafted')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  drafted_at timestamptz,
  constraint verified_research_has_evidence check (status = 'lead' or
    (verified_at is not null and length(source_url) > 10 and length(excerpt) >= 40 and
     (rights_basis = 'public-source' or length(permission_note) >= 20)))
);
alter table public.editorial_research enable row level security;
revoke all on public.editorial_research from anon, authenticated;
grant all on public.editorial_research to service_role;
create index if not exists editorial_research_status_idx on public.editorial_research(status, verified_at);

-- Keep legacy rows readable, but never silently publish new malformed briefs.
create or replace function public.check_editorial_brief() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if new.editorial_brief is null then return new; end if;
  if coalesce(new.editorial_brief->>'rights_basis','') not in ('public-source','author-permission')
    or coalesce(new.editorial_brief->>'operating_market','') not in ('domestic','china-outbound','overseas','unknown')
    or coalesce(new.editorial_brief->>'source_url','') !~ '^https?://'
    or coalesce(new.editorial_brief->>'source_url','') ~* '^https?://([^/]+\.)?(scys\.com|zsxq\.com)([:/]|$)'
  then raise exception 'Invalid editorial provenance'; end if;
  foreach k in array array['payer','problem','ai_role','solo_delivery','evidence','risk'] loop
    if length(coalesce(new.editorial_brief->'answers'->k->>'answer','')) < 4 then
      raise exception 'Missing editorial answer: %', k;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists radar_editorial_guard on public.radar_items;
create trigger radar_editorial_guard before insert or update on public.radar_items
  for each row execute function public.check_editorial_brief();
drop trigger if exists news_editorial_guard on public.news_items;
create trigger news_editorial_guard before insert or update on public.news_items
  for each row execute function public.check_editorial_brief();
commit;
