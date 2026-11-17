import Link from 'next/link';
import { LANES, chinaDate, type ReadingItem } from '@/lib/reading/model';
import { Impression, OriginalLink, Feedback, Bookmark, ShareReading, ReadingThumbnail, ReadingSummary } from './interactions';
export function ReadingCard({item}:{item:ReadingItem}) {
 return <Impression id={item.id}><article className="reading-card">
  <div className="reading-meta"><span>{item.source}</span><span className="reading-meta-dot">·</span><time dateTime={item.sourcePublishedAt||item.publishedAt}>{chinaDate(item.sourcePublishedAt||item.publishedAt)}</time><span className="reading-lane">{item.reviewed?LANES[item.lane]:'来源动态 · 未精选'}</span>{item.score!=null&&<span className="reading-score" title="AI 参考分：重要性、实用性、证据质量各0–5分，合计换算为百分制；不代表事实正确率。">AI <b>{item.score}</b><small>/100</small></span>}</div>
  <div className="reading-card-body"><h2><Link href={`/news/${item.id}`}>{item.title}</Link></h2><ReadingThumbnail item={item}/><ReadingSummary item={item}/></div>
  {item.relevance&&<p className="reading-recommendation"><span>{item.reviewed?'推荐理由':'来源说明'}</span>{item.relevance}</p>}
  <div className="reading-toolbar"><Feedback id={item.id} compact/><Bookmark item={item}/><ShareReading kind="news" id={item.id} title={item.title}/><OriginalLink id={item.id} url={item.sourceUrl}/></div>
 </article></Impression>;
}
