'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {Brief} from '@/lib/reading/model';
type Overview={counts:Record<string,number>;briefs:Brief[];checkedAt:string};
export default function AdminHome(){
 const[data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);setError('');try{const r=await fetch('/api/admin/overview',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}catch(e){setError(String(e));}finally{setBusy(false);}}
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return ()=>clearTimeout(timer);},[]);
 return <main className="admin-home"><div className="admin-heading"><div><p>采编 → 审核 → 发布</p><h1>今天的编辑工作</h1></div><button disabled={busy} onClick={()=>void load()}>{busy?'刷新中…':'刷新工作台'}</button></div><p>只统计新版资讯与周报。原始 X 动态不等于精选资讯，周报草稿不等于已发布周报。</p>{error&&<p role="alert">{error}</p>}{!data?<p>正在读取线上数据…</p>:<><div className="admin-grid">{[['待审资讯',data.counts.pending,'/admin/news'],['已发布资讯',data.counts.published,'/admin/news?state=published'],['系统筛出',data.counts.filtered,'/admin/news?state=filtered'],['周报草稿',data.briefs.filter(b=>b.status==='draft').length,'/admin/briefs']].map(([label,n,url])=><Link className="admin-tile" href={String(url)} key={label}><span>{label}</span><strong>{n}</strong></Link>)}</div><section><h2>周报工作区</h2><p>草稿可继续编辑和发布；统计来自线上周报记录。</p>{data.briefs.map(b=><article className="admin-brief-row" key={b.id}><div><small>{b.slug} · {b.status==='draft'?'草稿 · 未发布':'已发布'} · {b.item_ids.length} 条资讯</small><h3>{b.title}</h3></div><Link href={`/admin/briefs?edit=${b.id}`}>编辑这期周报 →</Link></article>)}{!data.briefs.length&&<p>暂无周报，前往周报管理创建。</p>}<Link href="/admin/briefs">管理全部周报与阅读反馈 →</Link></section><section><h2>工作顺序</h2><p>在资讯审核中核对原文、日期和推荐理由，通过后发布；在周报管理中选择已发布资讯组成周报。信源失败或长时间无更新，前往信源与采集检查。</p><p>最近刷新：{new Date(data.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p></section></>}</main>;
}
