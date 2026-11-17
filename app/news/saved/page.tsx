'use client';
import {useSyncExternalStore} from 'react';
import Link from 'next/link';
import {Header} from '@/components/page-shell';
import {ReadingCard} from '@/components/reading/card';
import {BOOKMARK_KEY,parseBookmarks} from '@/lib/reading/bookmarks';
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener('reading-bookmarks',callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener('reading-bookmarks',callback);};}
function snapshot(){try{return localStorage.getItem(BOOKMARK_KEY)||'[]';}catch{return '[]';}}
export default function SavedNews(){
 const raw=useSyncExternalStore(subscribe,snapshot,()=> '[]');const items=parseBookmarks(raw);
 return <><Header/><main className="reading-wrap"><header className="reading-hero"><p className="reading-eyebrow">AI OPC / SAVED</p><h1>收藏的资讯</h1><p>留给下一次思考。收藏仅保存在当前浏览器，不会跨设备同步；内容为保存时的快照，最新状态以详情页为准。</p></header><nav className="reading-tabs"><Link href="/news">精选资讯</Link><Link href="/news?view=all&source=x">X 中文动态</Link><Link href="/news/saved" aria-current="page">我的收藏 <small>{items.length}</small></Link></nav><div className="reading-list">{items.map(item=><ReadingCard key={item.id} item={item}/>)}</div>{!items.length&&<section className="reading-empty"><h2>还没有收藏</h2><p>在资讯下方点击“收藏”，把值得回看的内容留在这里。</p><Link href="/news">浏览精选资讯</Link></section>}</main></>;
}
