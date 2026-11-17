import QRCode from 'qrcode';
import {readingItem,publishedBrief} from '@/lib/reading/data';
import {sharePath} from '@/lib/reading/model';
export const dynamic='force-dynamic';
export async function GET(request:Request){const q=new URL(request.url).searchParams,kind=q.get('kind'),id=q.get('id')||'';if(!['news','briefs'].includes(kind||'')||id.length>80)return new Response('Not found',{status:404});const exists=kind==='news'?await readingItem(id):await publishedBrief(id);if(!exists)return new Response('Not found',{status:404});const url='https://www.aiopcnews.com'+sharePath(kind as 'news'|'briefs',id,'wechat');const svg=await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'M',margin:4,width:320});return new Response(svg,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store',...(q.get('download')==='1'?{'Content-Disposition':'attachment; filename="aiopc-qr.svg"'}:{})}});}
