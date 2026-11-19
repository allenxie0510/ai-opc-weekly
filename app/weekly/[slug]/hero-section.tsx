import type { WeeklyIssue } from '@/lib/types';
export function HeroSection({issue}:{issue:WeeklyIssue;dateStr:string}){
 return <header className="reading-wrap"><div className="reading-hero"><h1>第 {issue.issue_number} 期</h1><p>{issue.week_start}</p></div></header>;
}
