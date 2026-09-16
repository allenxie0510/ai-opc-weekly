import Link from 'next/link';
import { ResearchFrontispiece } from './category-hero';
import { REPORT_DIMENSIONS, REPORT_SECTIONS, type WeeklyReport } from '@/lib/weekly-report.mjs';
import { ReportActions } from './weekly-report-actions';
import type { NewsItem } from '@/lib/types';
import './weekly-research-report.css';

export function WeeklyResearchReport({report,item,issueLabel,issueHref,draft=false}:{report:WeeklyReport;item:NewsItem;issueLabel:string;issueHref:string;draft?:boolean}) {
 const date=new Date(report.generated_at).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});
 return <main className="wr-report">
  <div className="wr-topline"><Link href={issueHref}>← {issueLabel}</Link><span>AI OPC / RESEARCH NOTE</span></div>
  {draft&&<div className="wr-draft">编辑预览 · 本报告尚未公开发布</div>}
  <ResearchFrontispiece />
  <header className="wr-cover">
   <div className="wr-cover-copy"><p className="wr-eyebrow">创业研究 / 从案例到行动</p><h1>{report.headline}</h1><p className="wr-dek">{report.dek}</p><div className="wr-byline"><span>AI OPC 研究编辑</span><span>{date}</span><span>约 8–12 分钟</span></div><ReportActions item={item}/></div>
   <aside className="wr-score"><span className="wr-label">研究价值</span><strong>{report.score}<small>/100</small></strong><p>用于比较案例的学习价值<br/>不代表创业成功率</p><div className="wr-dimensions">{Object.entries(REPORT_DIMENSIONS).map(([key,label])=><div key={key}><span>{label}</span><meter min={0} max={5} value={report.dimensions[key]||0} aria-label={label}/><b>{report.dimensions[key]}/5</b></div>)}</div></aside>
  </header>
  <div className="wr-body">
   <nav className="wr-index" aria-label="报告目录"><span className="wr-label">本篇目录</span><a href="#judgment">01 编辑判断</a><a href="#facts">02 事实底稿</a><a href="#business">03 商业拆解</a><a href="#experiment">04 两周验证</a><a href="#risks">05 风险与未知</a><a href="#sources">06 来源与方法</a></nav>
   <div className="wr-content">
    <section id="judgment" className="wr-section"><div className="wr-section-head"><span>01</span><h2>先读结论</h2><em>编辑判断</em></div><p className="wr-verdict">{report.verdict}</p><div className="wr-takeaways">{report.takeaways.map((text,i)=><article key={i}><span>0{i+1}</span><p>{text}</p></article>)}</div></section>
    <section id="facts" className="wr-section"><div className="wr-section-head"><span>02</span><h2>把事实放在前面</h2><em>来源陈述</em></div><p className="wr-section-intro">以下内容有原文引用支撑；收入与成效如为作者自述，不等于独立审计。</p><ol className="wr-facts">{report.facts.map((fact,i)=><li key={i}><span className="wr-fact-number">F{String(i+1).padStart(2,'0')}</span><div><p>{fact.claim}</p><details><summary>核对原文 <a href={`#source-${fact.source_id}`}>[{fact.source_id}]</a></summary><blockquote>{fact.quote}</blockquote></details></div></li>)}</ol></section>
    <section id="business" className="wr-section"><div className="wr-section-head"><span>03</span><h2>这门生意，如何拆开看</h2><em>分析与假设</em></div><p className="wr-section-intro">这一部分将案例转化为可测试的创业假设，不能视为该公司已披露的经营结果。</p><div className="wr-analysis">{Object.entries(REPORT_SECTIONS).map(([key,label],i)=><article key={key}><div><span>{String(i+1).padStart(2,'0')}</span><h3>{label}</h3></div><p>{report.analysis[key]}</p></article>)}</div></section>
    <section id="experiment" className="wr-section"><div className="wr-section-head"><span>04</span><h2>先用两周，换一个答案</h2><em>建议实验</em></div><p className="wr-section-intro">先验证最脆弱的假设，再决定是否开发。以下阈值是实验建议，需要结合可触达客户和实际预算调整。</p><div className="wr-plan">{report.plan.map((step,i)=><article key={i}><div className="wr-plan-period"><span>0{i+1}</span><h3>{step.period}</h3></div><p>{step.action}</p><dl><div><dt>继续信号</dt><dd>{step.signal}</dd></div><div><dt>停止条件</dt><dd>{step.stop}</dd></div></dl></article>)}</div></section>
    <section id="risks" className="wr-section"><div className="wr-section-head"><span>05</span><h2>最可能错在哪里</h2><em>反方视角</em></div><div className="wr-risks">{report.risks.map((risk,i)=><article key={i}><h3>{risk.risk}</h3><p><span>如何验证 / </span>{risk.test}</p></article>)}</div><aside className="wr-unknown"><h3>仍待回答</h3><ul>{report.open_questions.map((q,i)=><li key={i}>{q}</li>)}</ul></aside></section>
    <section id="sources" className="wr-section wr-sources"><div className="wr-section-head"><span>06</span><h2>来源与研究方法</h2></div>{report.sources.map(source=><article id={`source-${source.id}`} key={source.id}><span>{source.id}</span><div><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><p>{new URL(source.url).hostname} · {source.published_at?`原文日期 ${new Date(source.published_at).toLocaleDateString('zh-CN')}`:'原文发布日期未披露'} · 读取于 {new Date(source.accessed_at).toLocaleDateString('zh-CN')}</p></div></article>)}<p className="wr-method">{report.evidence_note}</p><p className="wr-method">由 {report.model} 辅助分析并保存为研究报告。更正线索可通过<Link href="/about#corrections">编辑反馈</Link>提交。</p></section>
    <div className="wr-end"><span>把信息收藏下来，把假设拿出去验证。</span><Link href={issueHref}>回到{issueLabel} →</Link></div>
   </div>
  </div>
 </main>;
}
