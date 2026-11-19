import type { Metadata } from 'next';
import { Header } from '@/components/page-shell';
import { ReadingFeed } from '@/components/reading/feed';
import { readingFeed } from '@/lib/reading/data';
import { ReadingFilterEvent } from '@/components/reading/filter-event';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'精选资讯 · AI OPC',description:'为个人创作者、AI开发者与设计师精选行业变化、工具能力和经营信息。',alternates:{canonical:'https://www.aiopcnews.com/news'}};
export default async function NewsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams;const source=typeof q.source==='string'?q.source:'all',lane=typeof q.lane==='string'?q.lane:'all',view=q.view==='all'||source==='x'?'all':'selected';
 const query=typeof q.q==='string'?q.q.trim().slice(0,100):'';const page=Math.max(1,Math.floor(Number(q.page)||1));
 const items=await readingFeed(view==='all');return <><Header/><main className="reading-wrap"><header className="reading-hero"><h1>资讯</h1></header><ReadingFilterEvent lane={lane} source={source}/><ReadingFeed items={items} lane={lane} source={source} view={view} query={query} page={page}/></main></>;
}
