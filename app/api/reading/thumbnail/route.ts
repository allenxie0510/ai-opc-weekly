import { unstable_cache } from 'next/cache';
import { lookup } from 'node:dns/promises';
import { parseHTML } from 'linkedom';
import { readingItem } from '@/lib/reading/data';
import { safeHttp } from '@/lib/reading/model';
import { fetchDocument, publicAddress } from '@/lib/news/collect';
export const runtime='nodejs';
export const maxDuration=30;
const discoverImage=unstable_cache(async(url:string)=>{
 try{
  const {document}=parseHTML(await fetchDocument(url));
  const raw=document.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.getAttribute('content');
  return raw?safeHttp(new URL(raw,url).href):null;
 }catch{return null;}
},['reading-thumbnails-v1'],{revalidate:86400});
export async function GET(request:Request){
 const item=await readingItem(new URL(request.url).searchParams.get('id')||'');
 if(!item||!item.sourceUrl)return new Response('Not found',{status:404});
 const image=item.imageUrl||await discoverImage(item.sourceUrl);
 if(!image)return new Response('No source image',{status:404});
 try{const u=new URL(image);if(u.port&&!['80','443'].includes(u.port))throw new Error('Invalid port');const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Private image');}catch{return new Response('Invalid image',{status:404});}
 return new Response(null,{status:307,headers:{Location:image,'Cache-Control':'private, max-age=300'}});
}
