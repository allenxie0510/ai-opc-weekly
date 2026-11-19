'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import './workspace.css';
export default function AdminLayout({children}:{children:React.ReactNode}){
 const path=usePathname(),[ready,setReady]=useState(false),[checked,setChecked]=useState(false),[password,setPassword]=useState(''),[error,setError]=useState('');
 useEffect(()=>{fetch('/api/admin/session',{cache:'no-store'}).then(r=>r.json()).then(d=>setReady(d.authenticated)).catch(()=>setError('无法检查登录状态，请重试')).finally(()=>setChecked(true));},[]);
 async function login(e:React.FormEvent){e.preventDefault();setError('');try{const r=await fetch('/api/admin/session',{method:'POST',headers:{'x-admin-token':password}});if(!r.ok)throw Error('密码不正确或服务暂不可用');setPassword('');setReady(true);}catch(e){setError(String(e));}}
 if(!ready)return <main className="editor-workspace admin-signin"><p>AI OPC · 管理工作台</p><h1>登录后台</h1>{checked?<form onSubmit={login}><label>网站管理员密码<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button>登录</button></form>:<p>正在检查会话…</p>}<p role="alert">{error}</p></main>;
 return <div className="editor-workspace"><header className="admin-bar"><Link href="/admin"><strong>AI OPC / 管理工作台</strong></Link><Link href="/news">查看网站 ↗</Link><button onClick={async()=>{const r=await fetch('/api/admin/session',{method:'DELETE'});if(r.ok){localStorage.removeItem('ai_opc_admin_token');setReady(false);window.dispatchEvent(new Event('aiopc-admin-session-change'));}}}>退出</button></header><nav className="admin-navigation" aria-label="后台导航">{[['/admin','工作概览'],['/admin/news','内容管理'],['/admin/briefs','周报管理'],['/admin/sources','信源与采集']].map(([url,label])=><Link key={url} href={url} aria-current={path===url?'page':undefined}>{label}</Link>)}</nav>{children}<footer className="admin-legacy"><Link href="/admin/legacy">历史管理工具</Link><span>旧机会、旧周报和旧信号仅在此维护，不计入新版统计。</span></footer></div>;
}
