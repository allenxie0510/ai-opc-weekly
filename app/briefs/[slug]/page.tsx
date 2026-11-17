import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {Header} from '@/components/page-shell';
import {ReadingCard} from '@/components/reading/card';
import {ReadingVisit,ShareReading} from '@/components/reading/interactions';
import {publishedBrief} from '@/lib/reading/data';
import {chinaDate} from '@/lib/reading/model';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const{slug}=await params,result=await publishedBrief(slug);return result?{title:`${result.brief.title} · AI OPC 周报`,description:result.brief.summary,alternates:{canonical:`https://www.aiopcnews.com/briefs/${slug}`},openGraph:{type:'article',title:result.brief.title,description:result.brief.summary}}:{title:'周报暂不可用'};}
export default async function BriefPage({params}:{params:Promise<{slug:string}>}){const{slug}=await params,result=await publishedBrief(slug);if(!result)notFound();const{brief,items}=result;return <><Header/><main className="reading-wrap"><ReadingVisit id={`brief-${slug}`}/><Link href="/archive">全部周报</Link><header className="reading-hero"><p className="reading-eyebrow">AI OPC / WEEKLY</p><h1>{brief.title}</h1><p>{chinaDate(slug+'T00:00:00+08:00')} 起的一周 · {items.length} 条已发布精选</p><p>{brief.summary}</p></header><ShareReading kind="briefs" id={slug} title={brief.title}/><div className="reading-list">{items.map(i=><ReadingCard key={i.id} item={i}/>)}</div>{items.length===0&&<p>本期引用内容已下架，请查看其他周报。</p>}<p className="reading-note">周报引用同一条资讯：纠错会同步显示，已下架内容自动隐藏。</p></main></>;}
