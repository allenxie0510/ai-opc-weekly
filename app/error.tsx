'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="reading-wrap"><section className="reading-empty" role="alert"><h1>页面暂时无法加载</h1><p>请稍后重试，已发布的内容不会因此删除。</p><button onClick={reset}>重新加载</button></section></main>}
