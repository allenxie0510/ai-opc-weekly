'use client';
import Image from 'next/image';
import { useEffect,useRef,useState } from 'react';
import { trackReading } from '@/lib/reading/client';
import { sharePath } from '@/lib/reading/model';
export function ReadingVisit({id='feed',detail=false}:{id?:string;detail?:boolean}){
 useEffect(()=>{void trackReading('visit',id);if(detail)void trackReading('read',id);},[id,detail]);return null;
}
export function Impression({id,children}:{id:string;children:React.ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;let sent=false;const observer=new IntersectionObserver(entries=>{for(const e of entries){clearTimeout(timer);if(e.isIntersecting&&!sent)timer=setTimeout(()=>{if(document.visibilityState==='visible'){sent=true;void trackReading('impression',id);observer.disconnect();}},1200);}},{threshold:.5});if(ref.current)observer.observe(ref.current);return()=>{observer.disconnect();clearTimeout(timer);};},[id]);return <div ref={ref}>{children}</div>;
}
export function OriginalLink({id,url}:{id:string;url:string}){return url?<a href={url} target="_blank" rel="noopener noreferrer" onClick={()=>{void trackReading('source_click',id);}}>查看原文</a>:null;}
export function Feedback({id}:{id:string}){
 const [vote,setVote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(value:string){setBusy(true);const ok=await trackReading('feedback',id,{value});if(ok)setVote(value);setMessage(ok?'反馈已记录，可重新选择。':'未能记录反馈，请稍后再试；隐私模式或管理员浏览不计入统计。');setBusy(false);}
 return <section className="reading-feedback" aria-label="内容反馈"><strong>这条信息对你有用吗？</strong><div>{[['useful','有用'],['neutral','一般'],['irrelevant','与我无关']].map(([v,l])=><button key={v} disabled={busy} aria-pressed={vote===v} onClick={()=>void submit(v)}>{l}</button>)}</div><p role="status">{message}</p></section>;
}
export function ShareReading({kind,id,title}:{kind:'news'|'briefs';id:string;title:string}){
 const [show,setShow]=useState(false),[message,setMessage]=useState(''); const eventId=kind==='briefs'?`brief-${id}`:id;
 const path=sharePath(kind,id),url=`https://www.aiopcnews.com${path}`;
 async function copy(){try{await navigator.clipboard.writeText(url);setMessage('分享链接已复制');void trackReading('share',eventId);}catch{setMessage('复制失败，请复制下方链接。');}}
 async function nativeShare(){if(!navigator.share){await copy();return;}try{await navigator.share({title,url});setMessage('已打开分享');void trackReading('share',eventId);}catch{setMessage('分享已取消，可复制链接。');}}
 return <section className="reading-share" aria-label="分享内容"><div className="reading-actions"><button onClick={()=>void nativeShare()}>分享</button><button onClick={()=>void copy()}>复制链接</button><button aria-expanded={show} onClick={()=>setShow(!show)}>朋友圈二维码</button></div><p role="status">{message}</p>{show&&<div className="reading-qr"><Image unoptimized src={`/api/reading/qr?kind=${kind}&id=${encodeURIComponent(id)}`} width="240" height="240" alt={`扫码阅读：${title}`}/><p>二维码直达本页，可放入朋友圈海报。</p><a href={`/api/reading/qr?kind=${kind}&id=${encodeURIComponent(id)}&download=1`} download>下载二维码</a><p className="reading-url">{url}</p></div>}</section>;
}
