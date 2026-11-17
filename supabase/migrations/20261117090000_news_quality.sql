-- P0: isolated ingestion and private editorial workspace. Existing public data retained.
create table if not exists public.news_sources (
  id text primary key, definition jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.news_source_runs (
  id bigint generated always as identity primary key,
  source_id text not null references public.news_sources(id), checked_at timestamptz not null,
  report jsonb not null
);
create index if not exists news_source_runs_latest on public.news_source_runs(source_id, checked_at desc);
create table if not exists public.news_documents (
  id text primary key, source_id text not null references public.news_sources(id),
  url text not null, body_hash text not null, article jsonb not null,
  created_at timestamptz not null default now(), unique(url, body_hash)
);
create table if not exists public.news_queue (
  id uuid primary key default gen_random_uuid(),
  document_id text not null unique references public.news_documents(id),
  source_id text not null references public.news_sources(id),
  draft jsonb not null, event_key text not null,
  state text not null default 'pending' check (state in ('pending','filtered','rejected','published','merged')),
  reasons jsonb not null default '[]',
  merged_into uuid references public.news_queue(id),
  radar_id uuid references public.radar_items(id),
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists news_queue_state on public.news_queue(state, created_at desc);
create index if not exists news_queue_events on public.news_queue(event_key);
-- Exact model event-key collisions need review, not silent deletion.
create unique index if not exists news_queue_one_published_event on public.news_queue(event_key) where state = 'published';
create table if not exists public.news_review_log (
  id bigint generated always as identity primary key, queue_id uuid not null references public.news_queue(id),
  action text not null, reason text not null, before_draft jsonb not null, after_draft jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.news_sources enable row level security;
alter table public.news_source_runs enable row level security;
alter table public.news_documents enable row level security;
alter table public.news_queue enable row level security;
alter table public.news_review_log enable row level security;
revoke all on public.news_sources, public.news_source_runs, public.news_documents, public.news_queue, public.news_review_log from anon, authenticated;
grant all on public.news_sources, public.news_source_runs, public.news_documents, public.news_queue, public.news_review_log to service_role;
grant usage, select on sequence public.news_source_runs_id_seq, public.news_review_log_id_seq to service_role;

create or replace function public.review_news(
  p_id uuid, p_version integer, p_action text, p_draft jsonb, p_reason text,
  p_confirmed boolean default false, p_target uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.news_queue; doc public.news_documents; target public.news_queue;
  next_draft jsonb; c jsonb; new_radar uuid; source_name text;
begin
  select * into q from public.news_queue where id = p_id for update;
  if not found then raise exception 'Item not found'; end if;
  if q.version <> p_version then raise exception 'Version conflict: refresh before editing'; end if;
  if p_action not in ('save','publish','reject','restore','merge','unpublish') then raise exception 'Invalid action'; end if;
  if length(trim(coalesce(p_reason,''))) < 2 then raise exception 'Review reason required'; end if;
  if (q.state = 'published' and p_action <> 'unpublish') or (q.state = 'merged' and p_action <> 'restore') then raise exception 'Item is not editable'; end if;
  if p_action = 'unpublish' and q.state <> 'published' then raise exception 'Not published'; end if;
  next_draft := coalesce(p_draft,q.draft);
  select * into doc from public.news_documents where id = q.document_id;
  if p_action in ('save','publish') then
    if length(trim(coalesce(next_draft->>'title',''))) not between 1 and 180
      or length(trim(coalesce(next_draft->>'summary',''))) not between 1 and 1200
      or length(trim(coalesce(next_draft->>'relevance',''))) not between 1 and 600
      or coalesce(next_draft->>'lane','') not in ('industry','tools','business') then raise exception 'Invalid copy'; end if;
    if jsonb_typeof(next_draft->'claims') is distinct from 'array' then raise exception 'Claims required'; end if;
    if jsonb_array_length(next_draft->'claims') not between 1 and 12 then raise exception 'Claims required'; end if;
    for c in select * from jsonb_array_elements(next_draft->'claims') loop
      if length(trim(coalesce(c->>'text',''))) = 0 or length(coalesce(c->>'quote','')) < 15
        or coalesce(c->>'kind','') not in ('fact','attributed')
        or position(regexp_replace(trim(c->>'quote'),'\s+',' ','g') in regexp_replace(doc.article->>'body','\s+',' ','g')) = 0
      then raise exception 'Evidence quote not in original'; end if;
    end loop;
  end if;
  perform set_config('app.news_review','on',true);
  if p_action = 'publish' then
    if q.state <> 'pending' then raise exception 'Restore to pending first'; end if;
    if not p_confirmed then raise exception 'Human fact/date/duplicate review required'; end if;
    if doc.article->>'state' is distinct from 'ready' or length(coalesce(doc.article->>'body','')) < 400 then raise exception 'Original unavailable'; end if;
    select definition->>'name' into source_name from public.news_sources where id = q.source_id;
    if q.radar_id is not null then
      update public.radar_items set title=next_draft->>'title', summary=next_draft->>'summary', editor_note=next_draft->>'relevance', status='published', published_at=now() where id=q.radar_id;
      new_radar := q.radar_id;
    else
    insert into public.radar_items(title, summary, source_name, source_url, editor_note, pick_reason, category, status, published_at)
      values(next_draft->>'title', next_draft->>'summary', source_name, doc.url, next_draft->>'relevance',
      case next_draft->>'lane' when 'industry' then '看懂行业' when 'tools' then '改进工作' else '做好经营' end,
      'other', 'published', now()) returning id into new_radar;
    end if;
    update public.news_queue set state='published', radar_id=new_radar where id=q.id;
  elsif p_action = 'reject' then
    update public.news_queue set state='rejected', reasons=jsonb_build_array(p_reason) where id=q.id;
  elsif p_action = 'restore' then
    update public.news_queue set state='pending', merged_into=null, reasons='[]'::jsonb where id=q.id;
  elsif p_action = 'unpublish' then
    update public.radar_items set status='draft' where id=q.radar_id;
    update public.news_queue set state='pending' where id=q.id;
  elsif p_action = 'merge' then
    if p_target is null or p_target = q.id then raise exception 'Invalid merge target'; end if;
    select * into target from public.news_queue where id=p_target for update;
    if not found or target.state not in ('pending','published') then raise exception 'Invalid target state'; end if;
    update public.news_queue set state='merged', merged_into=p_target, reasons=jsonb_build_array(p_reason) where id=q.id;
  end if;
  update public.news_queue set draft=next_draft, version=version+1, updated_at=now() where id=q.id;
  insert into public.news_review_log(queue_id,action,reason,before_draft,after_draft)
    values(q.id,p_action,p_reason,q.draft,next_draft);
  perform set_config('app.news_review','off',true);
  return jsonb_build_object('id',q.id,'version',q.version+1,'radar_id',new_radar);
end; $$;
revoke all on function public.review_news(uuid,integer,text,jsonb,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.review_news(uuid,integer,text,jsonb,text,boolean,uuid) to service_role;

-- Managed news cannot bypass review via the older admin editor/publish endpoints.
create or replace function public.protect_reviewed_radar() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.news_queue where radar_id=old.id)
    and coalesce(current_setting('app.news_review',true),'') <> 'on' then
    raise exception '此资讯由新版采编台管理，请前往 /admin/news 审核';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists protect_reviewed_radar on public.radar_items;
create trigger protect_reviewed_radar before update or delete on public.radar_items
for each row execute function public.protect_reviewed_radar();

create table if not exists public.news_processing_log (
 id bigint generated always as identity primary key,
 document_id text not null references public.news_documents(id),
 outcome text not null check(outcome in ('blocked','error')),
 reasons jsonb not null, created_at timestamptz not null default now()
);
alter table public.news_processing_log enable row level security;
revoke all on public.news_processing_log from anon,authenticated;
grant all on public.news_processing_log to service_role;
grant usage,select on sequence public.news_processing_log_id_seq to service_role;
