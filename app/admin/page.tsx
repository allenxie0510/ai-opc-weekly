'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {Brief} from '@/lib/reading/model';
type Overview={counts:Record<string,number>;briefs:Brief[];checkedAt:string};
export default function AdminHome(){
 const[data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);setError('');try{const r=await fetch('/api/admin/overview',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}catch(e){setError(String(e));}finally{setBusy(false);}}
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return ()=>clearTimeout(timer);},[]);
 return <main className="admin-home"><div className="admin-heading"><div><p>采集 → 总编 Agent → 自动发布</p><h1>内容运营概览</h1></div><button disabled={busy} onClick={()=>void load()}>{busy?'刷新中…':'刷新工作台'}</button></div><p>只统计新版资讯与周报。原始 X 动态不等于精选资讯，周报草稿不等于已发布周报。</p>{error&&<p role="alert">{error}</p>}{!data?<p>正在读取线上数据…</p>:<><div className="admin-grid">{[['自动处理中',data.counts.pending,'/admin/sources'],['已发布资讯',data.counts.published,'/admin/news?state=published'],['系统筛出',data.counts.filtered,'/admin/news?state=filtered'],['已发布周报',data.briefs.filter(b=>b.status==='published').length,'/admin/briefs']].map(([label,n,url])=><Link className="admin-tile" href={String(url)} key={label}><span>{label}</span><strong>{n}</strong></Link>)}</div><section><h2>周报工作区</h2><p>周报由已发布精选组成，你可以调整导读与条目。</p>{data.briefs.map(b=><article className="admin-brief-row" key={b.id}><div><small>{b.slug} · {b.status==='draft'?'草稿 · 未发布':'已发布'} · {b.item_ids.length} 条资讯</small><h3>{b.title}</h3></div><Link href={`/admin/briefs?edit=${b.id}`}>编辑这期周报 →</Link></article>)}{!data.briefs.length&&<p>暂无周报，前往周报管理创建。</p>}<Link href="/admin/briefs">管理全部周报与阅读反馈 →</Link></section><section><h2>工作顺序</h2><p>总编 Agent 自动检查事实依据与读者价值，通过后直接发布。你可以在内容管理中微调或删除资讯；系统未推荐内容不会要求你逐条审批。信源失败或长时间无更新时，可在信源与采集查看原因。</p><p>最近刷新：{new Date(data.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p></section></>}</main>;
}
