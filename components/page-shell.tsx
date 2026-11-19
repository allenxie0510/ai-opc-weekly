'use client';
import Link from 'next/link';
import {BrandLogo} from './brand-logo';
import {useEffect,useRef,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {usePathname} from 'next/navigation';
import {WeeklyNav} from './weekly-nav';
import {getSession,onAuthChange,signOut} from '@/modules/explore/lib/auth';

const MAIN_LINKS=[{href:'/news',label:'资讯'},{href:'/weekly',label:'周报'},{href:'/explore',label:'方向探测器'}];
export function Header(){
 const pathname=usePathname();const [open,setOpen]=useState<'main'|'account'|null>(null);const [user,setUser]=useState<User|null>(null);
 const root=useRef<HTMLElement>(null);const mainButton=useRef<HTMLButtonElement>(null);const accountButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{let active=true;getSession().then(s=>{if(active)setUser(s?.user??null);}).catch(()=>{});const off=onAuthChange(s=>setUser(s?.user??null));return()=>{active=false;off();};},[]);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(null);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(null);(open==='main'?mainButton:accountButton).current?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[open]);
 const active=(href:string)=>href==='/weekly'?pathname.startsWith('/weekly')||pathname.startsWith('/briefs'):href==='/news'?pathname.startsWith('/news')&&pathname!=='/news/saved':pathname.startsWith(href);
 const links=MAIN_LINKS.map(link=><Link key={link.href} href={link.href} aria-current={active(link.href)?'page':undefined} onClick={()=>setOpen(null)}>{link.label}</Link>);
 return <header className="site-header" ref={root}><div className="site-bar"><button ref={mainButton} className="site-icon site-menu-toggle" aria-label={open==='main'?'关闭导航':'打开导航'} aria-expanded={open==='main'} aria-controls="mobile-primary-nav" onClick={()=>setOpen(open==='main'?null:'main')}><svg viewBox="0 0 24 24" aria-hidden="true">{open==='main'?<path d="m6 6 12 12M18 6 6 18"/>:<path d="M4 7h16M4 12h16M4 17h16"/>}</svg></button><Link href="/" className="site-brand" aria-label="AI OPC 首页" onClick={()=>setOpen(null)}><BrandLogo/></Link><nav className="site-primary" aria-label="主导航">{links}</nav><button ref={accountButton} className="site-icon site-account-toggle" aria-label="个人菜单" aria-expanded={open==='account'} aria-controls="site-account-panel" onClick={()=>setOpen(open==='account'?null:'account')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/></svg></button></div>{open==='main'&&<nav id="mobile-primary-nav" className="site-mobile-panel" aria-label="移动主导航">{links}</nav>}{open==='account'&&<nav id="site-account-panel" className="site-account-panel" aria-label="个人与网站"><p>{user?.email||'你的 AI OPC'}</p><Link href="/news/saved" onClick={()=>setOpen(null)}>我的收藏</Link><Link href="/sources" onClick={()=>setOpen(null)}>信源与编辑标准</Link><Link href="/about" onClick={()=>setOpen(null)}>关于 AI OPC</Link>{user?<button onClick={async()=>{await signOut();setOpen(null);}}>退出登录</button>:<Link href="/explore?login=1" onClick={()=>setOpen(null)}>登录 / 注册 ↗</Link>}</nav>}</header>;
}

export function PageShell({
  issue,
  issues,
  children,
  hero,
}: {
  issue: { slug: string; week_number: number; issue_number?: number; week_start: string; week_end: string };
  issues: { slug: string; week_number: number; issue_number?: number; week_start: string; week_end: string }[];
  children: React.ReactNode;
  hero: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <WeeklyNav currentSlug={issue.slug} issues={issues} />
      {hero}
      <main id="weekly-articles" className="container weekly-content">{children}</main>
    </>
  );
}
