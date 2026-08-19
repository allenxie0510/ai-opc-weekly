-- 机会「首页推荐位」手动控制
-- featured=true 的机会置于首页头条；未设置时回退为最高分机会
alter table opportunities add column if not exists featured boolean not null default false;

-- 保证同一时刻至多一条 featured（部分唯一索引：仅约束 featured=true 的行）
create unique index if not exists opportunities_one_featured_idx
  on opportunities (featured)
  where featured = true;
