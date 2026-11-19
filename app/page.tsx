import Image from 'next/image';
import Link from 'next/link';
import { Header } from '@/components/page-shell';
import { ReadingCard } from '@/components/reading/card';
import { ReadingVisit } from '@/components/reading/interactions';
import { readingFeed, publishedBriefs } from '@/lib/reading/data';
import { chinaDate } from '@/lib/reading/model';
import { TOPICS, editorialPicks } from '@/lib/reading/editorial';
export const dynamic = 'force-dynamic';
export default async function HomePage() {
  const [items, briefs] = await Promise.all([readingFeed(), publishedBriefs()]);
  const latest = briefs[0], picks = editorialPicks(items);
  return <><Header /><main className="editorial-home"><ReadingVisit />
    <div className="edition-line"><span>独立创造者的 AI 资讯编辑台</span><span>{items[0] ? `最近收录 ${chinaDate([...items].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0].publishedAt)}` : '精选持续整理中'}</span></div>
    <header className="editorial-masthead"><div><p className="reading-eyebrow">AI OPC — INTELLIGENCE FOR INDEPENDENTS</p><h1>看懂变化，<br /><em>做好下一步。</em></h1><p className="editorial-deck">从全球 AI 变化中，找到与你的创作、<br className="desktop-break" />开发和经营真正有关的信息。</p><Link className="editorial-button" href="/news">阅读精选 <span aria-hidden="true">↗</span></Link></div><figure><Image src="/editorial/independent-intelligence.webp" alt="放大镜将散乱信息转化为清晰方向的灰阶拼贴插图" width={1536} height={1024} priority /><figcaption>过滤噪声，保留判断。 / AI 概念插图</figcaption></figure></header>
    <nav className="editorial-topics" aria-label="按需求阅读">{TOPICS.map(t=><Link key={t.id} href={`/news?lane=${t.id}`}><span>{t.number} /</span><h2>{t.title}<span aria-hidden="true">↗</span></h2><p>{t.description}</p></Link>)}</nav>
    {picks.length > 0 && <section className="editorial-focus"><div className="editorial-section-head"><div><p className="reading-eyebrow">THE SHORTLIST</p><h2>先读这几条</h2></div><p>近 7 天已审核内容中，按价值评分与主题选取。</p></div><div className="editorial-picks">{picks.map((i,n)=><article key={i.id}><span className="editorial-index">0{n+1}</span><p className="reading-meta">{i.source} · {chinaDate(i.sourcePublishedAt||i.publishedAt)}</p><h3><Link href={`/news/${i.id}`}>{i.title}</Link></h3><p>{i.relevance}</p><Link className="editorial-text-link" href={`/news/${i.id}`}>阅读与依据 ↗</Link></article>)}</div></section>}
    <div className="editorial-columns"><section className="reading-wrap editorial-feed"><div className="editorial-section-head"><div><p className="reading-eyebrow">LATEST SELECTION</p><h2>最新精选</h2></div><Link href="/news">查看全部 ↗</Link></div><div className="reading-list">{items.slice(0,8).map(i=><ReadingCard key={i.id} item={i}/>)}</div>{!items.length&&<p className="reading-empty">精选正在整理中。</p>}<Link className="editorial-more" href="/news">继续阅读全部精选 →</Link></section>
    <aside className="editorial-sidebar"><section><p className="reading-eyebrow">WEEKLY EDITION</p><h2>一周，<br/>值得记住的变化。</h2><p>{latest?.title || '把已审核的信息串成一份有条理的周报。'}</p><Link href="/weekly">阅读本期周报 ↗</Link></section><section><p className="reading-eyebrow">OUR STANDARD</p><h2>每一条推荐，<br/>都应有理由。</h2><ol><li>可回到原始来源核对</li><li>说明谁会受益、什么改变</li><li>保留条件，不夸大效果</li></ol><Link href="/about#method">了解编辑标准 ↗</Link></section><section><p className="reading-eyebrow">STAY IN THE LOOP</p><h2>让信息来找你。</h2><p>用你喜欢的 RSS 阅读器订阅精选。无需登录。</p><a href="/feed.xml">订阅 RSS ↗</a><Link href="/news/saved">回看我的收藏 ↗</Link></section></aside></div>
    <section className="editorial-colophon"><h2>为独立工作的人，<br/>提供值得花时间的信息。</h2><p>个人创作者 · AI 开发者 · 设计师 · 一人公司经营者</p><Link href="/sources">我们从哪里获取信息 ↗</Link></section>
  </main></>;
}
