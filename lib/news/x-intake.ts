import type { Tweet } from '../types';
import type { Article, Source, SourceRun } from './types';
import { clean, hash } from './collect';

export function xSource(username: string): Source {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) throw new Error('Invalid X account');
  return { id: `x-${username.toLowerCase()}`, name: `X · @${username}`, url: `https://x.com/${username}`, kind: 'page', tier: 'discovery', lane: 'tools', language: 'en', enabled: true, cadenceHours: 4, allowedHosts: ['x.com'], note: '已跟踪账号的原始动态；仅为作者自述，翻译不作为证据。通过人工事实、日期、重复与价值审核后才可发布。' };
}
export function xArticle(tweet: Pick<Tweet,'tweet_id'|'author_username'|'content'|'published_at'|'media_urls'>, now = Date.now()): Article {
  const source = xSource(tweet.author_username);
  if (!/^\d{1,25}$/.test(tweet.tweet_id)) throw new Error('Invalid X post ID');
  const body = tweet.content.trim();
  const stamp = Date.parse(tweet.published_at);
  const issues: string[] = [];
  if (clean(body).length < 400) issues.push('原始动态信息量不足，仅保留来源动态；不可用翻译或补写扩充证据');
  if (!Number.isFinite(stamp) || stamp > now + 300000 || now - stamp > 14 * 86400000) issues.push('原文日期无效或不在近期窗口');
  if (/^(RT|R to|Replying to)\b/i.test(body)) issues.push('转帖或回复缺少完整上下文，仅保留来源动态');
  const image = tweet.media_urls?.find(url => /^https:\/\/pbs\.twimg\.com\//.test(url));
  return { sourceId: source.id, url: `https://x.com/${tweet.author_username}/status/${tweet.tweet_id}`, title: `${tweet.author_username} 的原始动态`, publishedAt: Number.isFinite(stamp) ? new Date(stamp).toISOString() : null, imageUrl: image || null, snippet: body.slice(0,240), body, bodyHash: hash(body), fetchedAt: new Date(now).toISOString(), state: issues.length ? 'blocked' : 'ready', issues };
}
export function xCollection(source: Source, tweets: Parameters<typeof xArticle>[0][], now = Date.now()) {
  const articles = tweets.filter(t => source.id === `x-${t.author_username.toLowerCase()}`).map(t => xArticle(t,now));
  const readable = articles.filter(a => a.state === 'ready').length;
  const run: SourceRun = { sourceId: source.id, checkedAt: new Date(now).toISOString(), state: readable ? 'healthy' : 'empty', discovered: articles.length, readable, durationMs: 0, error: null, sampleUrls: articles.slice(0,3).map(a=>a.url), latestPublishedAt: articles.map(a=>a.publishedAt).filter((d): d is string=>!!d).sort().at(-1) || null };
  return {articles,run};
}
export const X_EDITOR_PROMPT = `\n这是 X 原始动态，账号被跟踪不代表身份已核验。仅使用原始正文作为证据，不把翻译、链接标题或未读取的链接内容当作证明。所有 claims.kind 必须为 attributed，标题和摘要明确归属作者。\n闲聊、情绪、预测、口号、无具体可用能力或步骤的营销、转述传闻不得入选，importance/usefulness/evidence 均不得高于2。具体的一手操作方法、已开放的功能及适用条件可按原有标准评估；缺少可核对细节则 evidence 不得高于2。经营收入、效果数字与重大争议不能仅凭动态认定；敏感事件必须标记 sensitive=true。不得擅自补全线程、图片文字、价格或外链内容。summary控制在100—200个汉字，relevance具体说明目标读者、用途和自述限制。`;
