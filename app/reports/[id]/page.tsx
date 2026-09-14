import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/page-shell';
import { hasAdminSession } from '@/lib/admin-session';
import { createServerSupabase } from '@/lib/server-supabase';
import { isWeeklyReport } from '@/lib/weekly-report.mjs';
import { WeeklyResearchReport } from '@/components/weekly-research-report';
import type { NewsItem } from '@/lib/types';
export const dynamic='force-dynamic';
export const metadata={title:'创业研究报告 · AI OPC',robots:{index:false,follow:true}};
export default async function ReportPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))notFound();
 const admin=await hasAdminSession();
 const db=createServerSupabase(admin);if(!db)notFound();
 const {data:item,error}=await db.from('news_items').select('*').eq('id',id).maybeSingle();
 if(error||!item)notFound();
 let query=db.from('weekly_issues').select('id,slug,status,issue_number').eq('id',item.weekly_issue_id);
 if(!admin)query=query.eq('status','published');
 const {data:issue}=await query.maybeSingle();if(!issue)notFound();
 const report=item.editorial_brief?.weekly_report;
 if(!isWeeklyReport(report))return <><Header/><main className="container page-wrap"><p className="product-eyebrow">AI OPC · 创业研究</p><h1>这篇案例的完整报告尚未就绪</h1><p>已保存的周报内容仍可阅读。新的研究报告完成后会显示在这里。</p><Link href={issue.status==='draft'?'/admin':`/weekly/${issue.slug}`}>返回{issue.status==='draft'?'审核台':'本期周报'} →</Link></main></>;
 return <><Header/><WeeklyResearchReport report={report} item={item as NewsItem} issueLabel={`第 ${issue.issue_number} 期周报`} issueHref={issue.status==='draft'?'/admin':`/weekly/${issue.slug}`} draft={issue.status==='draft'}/></>;
}
