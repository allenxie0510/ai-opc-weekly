import Link from 'next/link';
import type {Metadata} from 'next';
import {Header} from '@/components/page-shell';
import {getWeeklyIssues} from '@/lib/data';
import {publishedBriefs} from '@/lib/reading/data';
import {chinaDate} from '@/lib/reading/model';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'周报 · AI OPC',description:'用一份周报回顾AI行业、工具与经营变化。',alternates:{canonical:'https://www.aiopcnews.com/archive'}};
export default async function ArchivePage(){const[briefs,legacy]=await Promise.all([publishedBriefs(),getWeeklyIssues()]);return <><Header/><main className="reading-wrap"><header className="reading-hero"><p className="reading-eyebrow">AI OPC / WEEKLY</p><h1>一周，值得记住的变化。</h1><p>引用已发布精选，事实纠错同步更新。分享链接或二维码，直达对应一期。</p></header><section className="reading-list">{briefs.map(b=><article key={b.id} className="reading-card"><p className="reading-meta">{chinaDate(b.slug+'T00:00:00+08:00')} 起的一周</p><h2><Link href={`/briefs/${b.slug}`}>{b.title}</Link></h2><p>{b.summary}</p><Link href={`/briefs/${b.slug}`}>阅读与分享</Link></article>)}</section>{!briefs.length&&<p className="reading-empty">新版周报正在整理。你可以先读精选资讯，或查看下方历史周报。</p>}<section className="reading-legacy"><h2>历史周报</h2><p>保留原有内容与链接，方便回查。</p>{legacy.map(b=><p key={b.id}><Link href={`/weekly/${b.slug}`}>{b.title}</Link> · {b.week_start}</p>)}</section></main></>;}
