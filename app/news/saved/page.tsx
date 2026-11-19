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
 return <><Header/><main className="reading-wrap"><header className="reading-hero"><h1>收藏的资讯</h1><p>保存在当前浏览器；最新内容以详情页为准。</p></header><p className="reading-count">{items.length} 条收藏</p><div className="reading-list">{items.map(item=><ReadingCard key={item.id} item={item}/>)}</div>{!items.length&&<section className="reading-empty"><h2>还没有收藏</h2><p>在资讯下方点击“收藏”，把值得回看的内容留在这里。</p><Link href="/news">浏览精选资讯</Link></section>}</main></>;
}
