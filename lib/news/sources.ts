import type { Source, Lane, Tier, SourceKind } from './types';
function source(id: string, name: string, url: string, kind: SourceKind, tier: Tier, lane: Lane, note: string, linkPattern?: string, language: 'en' | 'zh' = 'en'): Source {
  return { id, name, url, kind, tier, lane, note, linkPattern, language, enabled: true, cadenceHours: lane === 'business' ? 24 : 12, allowedHosts: [new URL(url).hostname] };
}
// Each endpoint is a discovery channel, never a blanket endorsement of its claims.
export const SOURCES: Source[] = [
  source('stripe', 'Stripe Blog', 'https://stripe.com/blog/feed.rss', 'rss', 'official', 'business', '支付、订阅与经营工具；企业规模案例不直接外推为个人收益。'),
  source('replicate', 'Replicate Blog', 'https://replicate.com/blog/rss', 'rss', 'official', 'tools', '图像、视频与音频模型接入，核对费用、开放条件与商用限制。'),
  source('deepmind', 'Google DeepMind', 'https://deepmind.google/blog/rss.xml', 'rss', 'official', 'industry', '模型能力与开放条件；研究基准不能替代实际收益。'),
  source('openrouter', 'OpenRouter Blog', 'https://openrouter.ai/blog/feed.xml', 'rss', 'official', 'tools', '模型接入、路由、价格与开发实践。'),
  source('elevenlabs', 'ElevenLabs Blog', 'https://elevenlabs.io/blog', 'index', 'official', 'tools', '语音、配音、内容制作与 Agent 交互能力。', '^/blog/(?!category|page)[^/]+/?$'),
  source('langchain', 'LangChain Blog', 'https://www.langchain.com/blog/rss.xml', 'rss', 'official', 'tools', 'Agent 开发、调试与部署；效果按厂商自述标注。'),
  source('vercel', 'Vercel Blog', 'https://vercel.com/atom', 'rss', 'official', 'tools', '个人 AI 应用开发与交付；排除常规维护。'),
  source('google', 'Google Blog', 'https://blog.google/rss/', 'rss', 'official', 'industry', '仅筛选模型供给、创作工具与商业规则变化。'),
  source('github', 'GitHub Blog', 'https://github.blog/feed/', 'rss', 'official', 'tools', 'AI 编程、Agent 与软件交付工作流。'),
  source('nvidia', 'NVIDIA Blog', 'https://blogs.nvidia.com/feed/', 'rss', 'official', 'industry', '关注模型与开发生态；排除与个人应用开发无关的硬件宣传。'),
  source('openai', 'OpenAI News', 'https://openai.com/news/rss.xml', 'rss', 'official', 'industry', '产品与开发者变化；效果声明保留官方归属。'),
  source('anthropic', 'Anthropic News', 'https://www.anthropic.com/news', 'index', 'official', 'industry', '原文核对发布范围与使用条件。', '^/news/(?!announcements|features|research|policy|science|economics|agents)[^/]+/?$'),
  source('gemini', 'Gemini API Changelog', 'https://aistudio.google.com/docs/changelog', 'page', 'official', 'tools', '接口变化与弃用；单页按内容版本监控。'),
  source('deepseek', 'DeepSeek Updates', 'https://api-docs.deepseek.com/updates', 'index', 'official', 'tools', '国内模型与接口变化。', '^/news/'),
  source('cursor', 'Cursor Changelog', 'https://cursor.com/changelog', 'index', 'official', 'tools', '重要能力与使用条件，不报道每项修复。', '^/changelog/[^/]+/?$'),
  source('figma', 'Figma Release Notes', 'https://www.figma.com/release-notes/', 'page', 'official', 'tools', '优先设计到交付；单页更新需审核日期。'),
  source('huggingface', 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'rss', 'practitioner', 'tools', '逐篇核对作者，社区作者不等于官方团队。'),
  source('simon', 'Simon Willison', 'https://simonwillison.net/atom/everything/', 'rss', 'practitioner', 'tools', '筛选 AI 实践，保留个人测试的条件和限制。'),
  source('revenuecat', 'RevenueCat', 'https://www.revenuecat.com/rss.xml', 'rss', 'practitioner', 'business', '订阅增长资料；注意平台客户样本偏差。'),
  source('techcrunch', 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'rss', 'reporting', 'industry', '行业事件；普通融资通稿低优先级。'),
  source('verge', 'The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'rss', 'reporting', 'industry', '背景与采访；报道数量不等于独立证据。'),
  source('cloudflare', 'Cloudflare Blog', 'https://blog.cloudflare.com/rss/', 'rss', 'official', 'tools', '只选与 AI 开发和个人交付相关的变化。'),
  source('supabase', 'Supabase Blog', 'https://supabase.com/rss.xml', 'rss', 'official', 'tools', '构建与交付条件、价格、平台变化。'),
  source('n8n', 'n8n Releases', 'https://github.com/n8n-io/n8n/releases.atom', 'rss', 'official', 'tools', '成熟项目版本监测；仅重大变化入选。'),
  source('indiehackers', 'Indie Hackers Podcast', 'https://feeds.transistor.fm/the-indie-hackers-podcast', 'rss', 'practitioner', 'business', '节目简介不能替代访谈全文；收入按自述处理。'),
  source('sspai', '少数派', 'https://sspai.com/feed', 'rss', 'practitioner', 'tools', '中文工作实践，排除普通消费电子内容。', undefined, 'zh'),
  source('showhn', 'Show HN', 'https://hnrss.org/show', 'rss', 'discovery', 'business', '产品发布仅作线索，不证明付费需求。'),
  source('v2ex', 'V2EX 分享创造', 'https://www.v2ex.com/feed/create.xml', 'rss', 'discovery', 'business', '用户问题和产品发布；需核对原始产品。', undefined, 'zh'),
];
// Known legitimate migrations only. Redirects to arbitrary hosts are rejected.
SOURCES.find(s => s.id === 'gemini')!.allowedHosts.push('aistudio.google.com');

SOURCES.find(s => s.id === 'deepmind')!.allowedHosts.push('blog.google');
