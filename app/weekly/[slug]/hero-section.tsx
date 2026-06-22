import type { WeeklyIssue } from '@/lib/types';

export function HeroSection({ issue, dateStr }: { issue: WeeklyIssue; dateStr: string }) {
  return (
    <section className="hero">
      <div className="eyebrow">
        <span className="dot" style={{ width: 6, height: 6, background: 'var(--color-coral)', borderRadius: '50%', display: 'inline-block' }} />
        周报 · 2026 年第 {issue.week_number} 周 · 一人公司特辑
      </div>
      <h1>AI × 独立创作<br />复利创业方向</h1>
      <p className="sub">
        12 条精选 AI 创业趋势，聚焦独立设计师/开发者可落地的一人公司机会。每一条都附带真实数据、变现路径和 MVP 周期。
      </p>
      <div className="meta">
        <span>{dateStr}</span>
        <span className="dot-sep"></span>
        <span>12 个项目</span>
      </div>
    </section>
  );
}
