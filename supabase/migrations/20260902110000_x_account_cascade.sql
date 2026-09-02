-- X 账号删除完整性：
-- 1. 删除账号时立即硬删除全部历史推文（大小写不敏感）；
-- 2. 拒绝写入不再追踪账号的推文；
-- 3. 清理迁移执行前已经存在的孤儿推文；
-- 4. 管理 API 可通过单个事务删除账号与推文。

begin;

create index if not exists idx_twitter_accounts_username_lower
  on public.twitter_accounts (lower(username));

create or replace function public.ensure_tracked_tweet_author()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tracked_account_id uuid;
begin
  -- KEY SHARE 与账号删除互斥：若抓取与删除并发，要么推文先写入后被
  -- 删除触发器清走，要么账号先删除后本次写入被拒绝，不会留下孤儿。
  select id
    into tracked_account_id
    from public.twitter_accounts
   where lower(username) = lower(new.author_username)
   limit 1
   for key share;

  if tracked_account_id is null then
    raise foreign_key_violation using
      message = format('X account @%s is not tracked', new.author_username);
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_tracked_tweet_author_trigger on public.tweets;
create trigger ensure_tracked_tweet_author_trigger
before insert or update of author_username on public.tweets
for each row execute function public.ensure_tracked_tweet_author();

create or replace function public.delete_tweets_for_removed_twitter_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.tweets
   where lower(author_username) = lower(old.username);
  return old;
end;
$$;

drop trigger if exists delete_tweets_for_removed_twitter_account_trigger
  on public.twitter_accounts;
create trigger delete_tweets_for_removed_twitter_account_trigger
before delete on public.twitter_accounts
for each row execute function public.delete_tweets_for_removed_twitter_account();

-- 迁移本身不保留任何已删除账号的历史推文。
delete from public.tweets as tweet
where not exists (
  select 1
    from public.twitter_accounts as account
   where lower(account.username) = lower(tweet.author_username)
);

create or replace function public.delete_twitter_account_with_tweets(target_username text)
returns table (
  deleted_username text,
  deleted_tweets bigint,
  account_deleted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := lower(regexp_replace(btrim(target_username), '^@', ''));
  account_row public.twitter_accounts%rowtype;
  tweet_count bigint := 0;
begin
  select *
    into account_row
    from public.twitter_accounts
   where lower(username) = normalized_username
   limit 1
   for update;

  -- 即使账号已被先行删除，也允许再次调用来清除旧版本遗留的孤儿推文。
  delete from public.tweets
   where lower(author_username) = normalized_username;
  get diagnostics tweet_count = row_count;

  if account_row.id is not null then
    delete from public.twitter_accounts where id = account_row.id;
    return query select account_row.username, tweet_count, true;
  elsif tweet_count > 0 then
    return query select regexp_replace(btrim(target_username), '^@', ''), tweet_count, false;
  end if;
end;
$$;

revoke all on function public.delete_twitter_account_with_tweets(text)
  from public, anon, authenticated;
grant execute on function public.delete_twitter_account_with_tweets(text)
  to service_role;

commit;
