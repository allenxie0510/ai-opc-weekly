-- ═══════════════════════════════════════════════════════════════
-- AI OPC · Decision Engine 迁移 003 · Outcome Calibration 评分校准（P3.3 飞轮最后一块）
-- 在 Supabase → SQL Editor 整段执行（幂等，可重复执行）
--
-- 用途：复评时 GLM 除了打分，还要回答"初评判断对了吗"——
--   verdict 判定（confirmed/partially/refuted/too-early）+ 一句话中文复盘。
--   初评记录（source='initial'）不带这两列，它是被校准的对象。
-- 兼容：rescore-opportunities.mjs 做了降级容错——本迁移未执行时
--   复评照常跑（不写校准列），执行后自动开始落校准数据。
-- ═══════════════════════════════════════════════════════════════

alter table opportunity_score_history
  add column if not exists verdict text,           -- confirmed / partially / refuted / too-early
  add column if not exists calibration_note text;  -- 一句话中文复盘（≤60 字）

-- 判定值白名单约束（初评记录为 NULL，允许）
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'opp_score_history_verdict_check'
  ) then
    alter table opportunity_score_history
      add constraint opp_score_history_verdict_check
      check (verdict in ('confirmed', 'partially', 'refuted', 'too-early') or verdict is null);
  end if;
end $$;

-- ═══ 验证：执行完应返回 verdict / calibration_note 两行 ───
-- select column_name from information_schema.columns
-- where table_name = 'opportunity_score_history'
--   and column_name in ('verdict', 'calibration_note');
