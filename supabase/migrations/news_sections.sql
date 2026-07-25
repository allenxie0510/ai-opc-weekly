-- P2: 周报三段式（picks 快讯精选 / deepdive 深度拆解 / rejected 本周弃选）
-- 旧期数无此列值，默认 'picks'，前端按 undefined/'picks' 兼容旧平铺布局
alter table news_items add column if not exists section text default 'picks';
