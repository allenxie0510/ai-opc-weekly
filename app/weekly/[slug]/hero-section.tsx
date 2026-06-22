import type { WeeklyIssue } from '@/lib/types';

export function HeroSection({ issue, dateStr }: { issue: WeeklyIssue; dateStr: string }) {
  return (
    <section className="pt-8 pb-6">
      <div className="flex items-center gap-2 text-xs text-[var(--color-coral)] font-semibold mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-coral)] inline-block" />
        周报 · 2026 年第 {issue.week_number} 周 · 一人公司特辑
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-[var(--color-ink)] leading-tight mb-2">
        AI × 独立创作<br />复利创业方向
      </h1>
      <p className="text-sm text-[var(--color-steel)] max-w-lg">
        12 条精选 AI 创业趋势，聚焦独立设计师/开发者可落地的一人公司机会。每一条都附带真实数据、变现路径和 MVP 周期。
      </p>
    </section>
  );
}
