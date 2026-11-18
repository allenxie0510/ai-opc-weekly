import type {Metadata} from 'next';
import {WeeklyReader} from '@/components/reading/weekly-reader';
import {publishedBrief} from '@/lib/reading/data';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const{slug}=await params,result=await publishedBrief(slug);return result?{title:`${result.brief.title} · AI OPC 周报`,description:result.brief.summary,alternates:{canonical:`https://www.aiopcnews.com/briefs/${slug}`},openGraph:{type:'article',title:result.brief.title,description:result.brief.summary}}:{title:'周报暂不可用'};}
export default async function BriefPage({params}:{params:Promise<{slug:string}>}){const{slug}=await params;return <WeeklyReader slug={slug}/>;}
