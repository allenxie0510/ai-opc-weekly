import type {Metadata} from 'next';
import {WeeklyReader} from '@/components/reading/weekly-reader';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'本周周报 · AI OPC',description:'每周精选：看懂行业、改进工作、做好经营。',alternates:{canonical:'https://www.aiopcnews.com/weekly'}};
export default function WeeklyPage(){return <WeeklyReader/>;}
