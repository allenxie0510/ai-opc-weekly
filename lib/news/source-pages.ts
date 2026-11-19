/** Reader-facing pages. Collection endpoints remain private implementation details. */
export const SOURCE_PAGES: Record<string,string> = {
 stripe:'https://stripe.com/blog',replicate:'https://replicate.com/blog',deepmind:'https://deepmind.google/blog/',
 openrouter:'https://openrouter.ai/blog',elevenlabs:'https://elevenlabs.io/blog',langchain:'https://www.langchain.com/blog',
 vercel:'https://vercel.com/blog',google:'https://blog.google/',github:'https://github.blog/',nvidia:'https://blogs.nvidia.com/',
 openai:'https://openai.com/news/',anthropic:'https://www.anthropic.com/news',gemini:'https://aistudio.google.com/docs/changelog',
 deepseek:'https://api-docs.deepseek.com/updates',cursor:'https://cursor.com/changelog',figma:'https://www.figma.com/release-notes/',
 huggingface:'https://huggingface.co/blog',simon:'https://simonwillison.net/',revenuecat:'https://www.revenuecat.com/blog/',
 techcrunch:'https://techcrunch.com/category/artificial-intelligence/',verge:'https://www.theverge.com/ai-artificial-intelligence',
 cloudflare:'https://blog.cloudflare.com/',supabase:'https://supabase.com/blog',n8n:'https://github.com/n8n-io/n8n/releases',
 indiehackers:'https://www.indiehackers.com/podcasts',sspai:'https://sspai.com/',showhn:'https://news.ycombinator.com/show',v2ex:'https://www.v2ex.com/go/create',
};
export function sourcePageUrl(source:{id:string;url:string}){return SOURCE_PAGES[source.id]||source.url;}
