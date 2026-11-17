import {notFound} from 'next/navigation';
import Link from 'next/link';
import type {Metadata} from 'next';
import {Header} from '@/components/page-shell';
import {readingItem} from '@/lib/reading/data';
import {LANES,chinaDate} from '@/lib/reading/model';
import {ReadingVisit,OriginalLink,ShareReading,Feedback,Bookmark,ReadingThumbnail} from '@/components/reading/interactions';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const{id}=await params,item=await readingItem(id);return item?{title:`${item.title} · AI OPC`,description:item.summary.slice(0,180),alternates:{canonical:`https://www.aiopcnews.com/news/${id}`},openGraph:{title:item.title,description:item.summary.slice(0,180),type:'article'}}:{title:'内容暂不可用'};}
export default async function ReadingDetail({params}:{params:Promise<{id:string}>}){const{id}=await params,item=await readingItem(id);if(!item)notFound();return <><Header/><main className="reading-wrap reading-detail"><ReadingVisit id={id} detail/><Link href="/news" className="reading-back">返回资讯</Link><div className="reading-meta"><span>{item.reviewed?LANES[item.lane]:'X 来源动态 · 未精选'}</span><span>{item.source}</span></div><h1>{item.title}</h1><p className="reading-date">原文发布时间：{item.sourcePublishedAt?chinaDate(item.sourcePublishedAt):'未确认，请核对原文'} · 本站收录：{chinaDate(item.publishedAt)}</p><ReadingThumbnail item={item}/><p className="reading-detail-copy">{item.summary}</p><section className="reading-value"><h2>{item.reviewed?'对谁有用，为什么':'来源说明'}</h2><p>{item.relevance||'请结合自己的实际工作与原始来源判断适用范围。'}</p></section><OriginalLink id={id} url={item.sourceUrl}/><p className="reading-note">这里提供摘要与编辑判断，完整内容以原始来源为准。来源自述不代表本站独立实测。</p><div className="reading-toolbar"><Feedback id={id} compact/><Bookmark item={item}/><ShareReading kind="news" id={id} title={item.title}/></div></main></>;}
