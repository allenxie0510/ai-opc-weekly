'use client';
import Image from 'next/image';
import { useEffect,useId,useRef,useState,useSyncExternalStore } from 'react';
import { trackReading } from '@/lib/reading/client';
import { LineIcon } from '@/components/icons';
import { BOOKMARK_KEY,parseBookmarks } from '@/lib/reading/bookmarks';
import type { ReadingItem } from '@/lib/reading/model';
import { sharePath } from '@/lib/reading/model';
export function ReadingVisit({id='feed',detail=false}:{id?:string;detail?:boolean}){
 useEffect(()=>{void trackReading('visit',id);if(detail)void trackReading('read',id);},[id,detail]);return null;
}
export function Impression({id,children}:{id:string;children:React.ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;let sent=false;const observer=new IntersectionObserver(entries=>{for(const e of entries){clearTimeout(timer);if(e.isIntersecting&&!sent)timer=setTimeout(()=>{if(document.visibilityState==='visible'){sent=true;void trackReading('impression',id);observer.disconnect();}},1200);}},{threshold:.5});if(ref.current)observer.observe(ref.current);return()=>{observer.disconnect();clearTimeout(timer);};},[id]);return <div ref={ref}>{children}</div>;
}
export function OriginalLink({id,url}:{id:string;url:string}){return url?<a href={url} target="_blank" rel="noopener noreferrer" onClick={()=>{void trackReading('source_click',id);}}>查看原文</a>:null;}
const memoryVotes=new Map<string,string>();
function subscribeReadingStorage(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener('reading-bookmarks',callback);window.addEventListener('reading-votes',callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener('reading-bookmarks',callback);window.removeEventListener('reading-votes',callback);};}
function voteSnapshot(id:string){try{return localStorage.getItem('aiopc_vote_'+id)??memoryVotes.get(id)??'';}catch{return memoryVotes.get(id)||'';}}
function bookmarksSnapshot(){try{return localStorage.getItem(BOOKMARK_KEY)||'[]';}catch{return '[]';}}
export function Feedback({id,compact=false}:{id:string;compact?:boolean}){
 const vote=useSyncExternalStore(subscribeReadingStorage,()=>voteSnapshot(id),()=> '');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(value:string){
  if(busy)return;
  const next=vote===value?'':value;
  memoryVotes.set(id,next);try{localStorage.setItem('aiopc_vote_'+id,next);}catch{}
  window.dispatchEvent(new Event('reading-votes'));setBusy(true);
  const ok=await trackReading('feedback',id,{value:next||'neutral'});
  setMessage(ok?'反馈已记录。':'选择已保存在本浏览器，本次未计入站点统计。');setBusy(false);
 }
 useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),3000);return()=>clearTimeout(timer);},[message]);
 return <section className={`reading-feedback ${compact?'is-compact':''}`} aria-label="内容反馈">{!compact&&<strong>这条信息对你有用吗？</strong>}<div>{[['useful','赞','thumb-up'],['irrelevant','踩','thumb-down']].map(([v,l,icon])=><button key={v} disabled={busy} aria-label={l==='赞'?'赞：对我有用':'踩：与我无关'} title={l==='赞'?'对我有用':'与我无关'} aria-pressed={vote===v} onClick={()=>void submit(v)}><LineIcon name={icon as 'thumb-up'|'thumb-down'} fill={vote===v?'currentColor':'none'}/><span>{l}</span></button>)}</div>{message&&<p role="status">{message}</p>}</section>;
}
export function ShareReading({kind,id,title}:{kind:'news'|'briefs';id:string;title:string}){
 const [show,setShow]=useState(false),[message,setMessage]=useState(''); const eventId=kind==='briefs'?`brief-${id}`:id;
 const url=`https://www.aiopcnews.com${sharePath(kind,id)}`;
 async function copy(){try{await navigator.clipboard.writeText(url);setMessage('分享链接已复制');void trackReading('share',eventId);}catch{setMessage('复制失败，请手动复制下方链接。');}}
 return <section className="reading-share" aria-label="分享内容"><button aria-expanded={show} onClick={()=>setShow(!show)}><LineIcon name="share"/>分享</button>{show&&<div className="reading-share-panel"><div className="reading-share-heading"><strong>分享这{kind==='briefs'?'期周报':'条资讯'}</strong><button aria-label="关闭分享" onClick={()=>setShow(false)}><LineIcon name="x"/></button></div><Image unoptimized src={`/api/reading/qr?kind=${kind}&id=${encodeURIComponent(id)}`} width="180" height="180" alt={`扫码阅读：${title}`}/><p>微信扫码，直达原文摘要与推荐理由</p><div className="reading-actions"><button onClick={()=>void copy()}>复制链接</button><a href={`/api/reading/qr?kind=${kind}&id=${encodeURIComponent(id)}&download=1`} download>下载二维码</a></div><p className="reading-url">{url}</p>{message&&<p role="status">{message}</p>}</div>}</section>;
}
export function Bookmark({item}:{item:ReadingItem}){
 const raw=useSyncExternalStore(subscribeReadingStorage,bookmarksSnapshot,()=> '[]');const saved=parseBookmarks(raw).some(i=>i.id===item.id);
 const [message,setMessage]=useState('');
 useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),3000);return()=>clearTimeout(timer);},[message]);
 function toggle(){try{const list=parseBookmarks(localStorage.getItem(BOOKMARK_KEY));const exists=list.some(i=>i.id===item.id);if(!exists&&list.length>=500){setMessage('收藏已满，请先移除部分内容。');return;}localStorage.setItem(BOOKMARK_KEY,JSON.stringify(exists?list.filter(i=>i.id!==item.id):[item,...list]));window.dispatchEvent(new Event('reading-bookmarks'));setMessage(exists?'已取消收藏':'已收藏到本浏览器');}catch{setMessage('浏览器未允许保存收藏，请检查存储设置。');}}
 return <span className="reading-bookmark"><button onClick={toggle} aria-pressed={saved} title="收藏保存在当前浏览器"><LineIcon name="bookmark" fill={saved?'currentColor':'none'}/>{saved?'已收藏':'收藏'}</button>{message&&<span className="reading-action-status" role="status">{message}</span>}</span>;
}
export function ReadingThumbnail({item}:{item:ReadingItem}){
 const [failed,setFailed]=useState(false);if(failed||(!item.imageUrl&&item.kind==='x'))return null;
 return <Image unoptimized className="reading-thumbnail" src={item.imageUrl||`/api/reading/thumbnail?id=${encodeURIComponent(item.id)}`} alt="" width={440} height={292} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;
}

export function ReadingSummary({item,detail=false}:{item:ReadingItem;detail?:boolean}){
 const [expanded,setExpanded]=useState(false);const copyId=useId();
 const [translated,setTranslated]=useState(item.translated?item.summary:'');
 const [state,setState]=useState<'idle'|'loading'|'failed'>('idle');
 const [attempt,setAttempt]=useState(0);const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(item.kind!=='x'||translated)return;
  let cancelled=false,started=false;
  const observer=new IntersectionObserver(entries=>{
   if(started||!entries.some(e=>e.isIntersecting))return;started=true;observer.disconnect();
   setState('loading');
   void fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tweet_id:item.id.slice(2)}),signal:AbortSignal.timeout(60000)})
    .then(async r=>{if(!r.ok)throw new Error();const data=await r.json();if(typeof data.translated_text!=='string'||!data.translated_text.trim())throw new Error();if(!cancelled){setTranslated(data.translated_text);setState('idle');}})
    .catch(()=>{if(!cancelled)setState('failed');});
  },{rootMargin:'100px'});
  if(ref.current)observer.observe(ref.current);
  return()=>{cancelled=true;observer.disconnect();};
 },[item.id,item.kind,translated,attempt]);
 return <div ref={ref} className={`reading-excerpt ${expanded?'is-expanded':''}`}><div id={copyId}><p className={detail?'reading-detail-copy':'reading-summary'}>{item.kind==='x'?(translated||(state==='failed'?'中文翻译暂不可用，可重试或展开原文。':'正在准备中文翻译…')):item.summary}</p>{!detail&&item.relevance&&<p className="reading-recommendation"><span>{item.reviewed?'推荐理由':'来源说明'}</span>{item.relevance}</p>}{item.kind==='x'&&(detail||expanded)&&<>{state==='failed'&&<button className="reading-translate-retry" onClick={()=>setAttempt(n=>n+1)}>重试翻译</button>}<details className="reading-translation"><summary>{translated?'机器翻译 · 查看原文':'查看原文'}</summary><p>{item.originalText||item.summary}</p></details></>}</div>{!detail&&<button className="reading-expand" aria-expanded={expanded} aria-controls={copyId} onClick={()=>setExpanded(!expanded)}>{expanded?'收起摘要':'展开摘要'}<span aria-hidden="true">⌄</span></button>}</div>;
}
