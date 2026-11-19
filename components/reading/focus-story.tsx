import Link from 'next/link';
import {chinaDate,type ReadingItem} from '@/lib/reading/model';
import {ReadingThumbnail,Impression} from './interactions';
export function FocusStory({item,label='本周焦点'}:{item:ReadingItem;label?:string}){
 return <Impression id={item.id}><article className="focus-story" aria-label={label}><div className="focus-copy"><p className="focus-kicker">{label}</p><h2><Link href={`/news/${item.id}`}>{item.title}</Link></h2><p className="focus-summary">{item.summary}</p>{item.relevance&&<p className="focus-value"><span>为什么值得看</span>{item.relevance}</p>}<div className="focus-meta"><span>{item.source} · {chinaDate(item.sourcePublishedAt||item.publishedAt)}</span><Link href={`/news/${item.id}`}>阅读详情 ↗</Link></div></div><ReadingThumbnail item={item}/></article></Impression>;
}
