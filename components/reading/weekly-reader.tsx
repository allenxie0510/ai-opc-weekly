import Image from 'next/image';
import {TopicHeading} from './topic-heading';
import {Header} from '@/components/page-shell';
import {ReadingCard} from './card';
import {ReadingVisit,ShareReading} from './interactions';
import {WeeklySwitcher} from './weekly-switcher';
import {publishedBrief,publishedBriefs} from '@/lib/reading/data';
import {getWeeklyIssues} from '@/lib/data';
import {weeklyOptions} from '@/lib/reading/weekly-options';
import {notFound} from 'next/navigation';
import './weekly.css';
export async function WeeklyReader({slug}:{slug?:string}){
 const[briefs,legacy]=await Promise.all([publishedBriefs(),getWeeklyIssues()]);const selected=slug||briefs[0]?.slug;
 const result=selected?await publishedBrief(selected):null;if(slug&&!result)notFound();
 const options=weeklyOptions(briefs,legacy);const issueLabel=options.find(o=>o.url===`/briefs/${result?.brief.slug}`)?.label;
 return <><Header/><main className="reading-wrap brief-reader"><WeeklySwitcher current={result?`/briefs/${result.brief.slug}`:''} options={options}/>{!result?<section className="reading-empty"><h1>本周周报正在整理</h1><p>可在顶部切换阅读已发布的历史周报。</p></section>:<><ReadingVisit id={`brief-${result.brief.slug}`}/><header className="reading-hero"><h1>{issueLabel?.split(' · ')[0]}</h1><p>{result.brief.slug} · {result.items.length} 条精选</p></header><figure className="brief-cover"><Image src="/editorial/weekly-perspective.webp" alt="书页变成通向蓝色窗口的阶梯，象征把信息转化为判断" width={1200} height={800} priority/><figcaption>从一周的信息中，找到下一步。 / AI 概念插图</figcaption></figure><section className="brief-intro" aria-label="本期导读"><h2>本期导读</h2>{result.brief.summary.split(/\n\s*\n/).filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}</section><div className="brief-tools"><nav aria-label="本期目录">{[['industry','看懂行业'],['tools','改进工作'],['business','做好经营'],['other','更多值得关注']].filter(([lane])=>result.items.some(i=>i.lane===lane)).map(([lane,label])=><a href={`#weekly-${lane}`} key={lane}>{label}</a>)}</nav><ShareReading kind="briefs" id={result.brief.slug} title={result.brief.title}/></div>{[['industry','看懂行业','影响模型、平台与使用成本的重要变化。'],['tools','改进工作','可以用于内容制作、设计、开发和交付的新能力。'],['business','做好经营','与获客、付费体验和经营规则有关的信息。'],['other','更多值得关注','其他值得保留的变化。']].map(([lane,title,description])=>{const items=result.items.filter(i=>i.lane===lane);return items.length?<section id={`weekly-${lane}`} className="brief-section" key={lane}><header><h2 className="topic-section-bar"><TopicHeading lane={lane} title={title}/><small>{items.length} 条</small></h2><p>{description}</p></header><div className="reading-list">{items.map(i=><ReadingCard key={i.id} item={i}/>)}</div></section>:null;})}{!result.items.length&&<p>本期引用内容已下架，请切换其他周报。</p>}</>}</main></>;
}
