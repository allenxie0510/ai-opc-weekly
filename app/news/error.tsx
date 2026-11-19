'use client';
import Link from 'next/link';
export default function NewsError({reset}:{reset:()=>void}){return <main className="reading-wrap"><section className="reading-empty" role="alert"><h1>资讯暂时无法加载</h1><p>这是加载问题，不代表没有资讯。请稍后重试。</p><button onClick={reset}>重新加载</button><p><Link href="/">返回首页</Link></p></section></main>}
