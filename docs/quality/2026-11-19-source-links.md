# Reader-facing source link audit — 2026-11-19

All 28 configured sources have explicit HTML destination pages. RSS/API collection endpoints remain unchanged. Public directory and admin source list share the same mapping.

| Source | Reader page | Verification |
|---|---|---|
| stripe | https://stripe.com/blog | HTTP 200, HTML and matching title |
| replicate | https://replicate.com/blog | HTTP 200, HTML and matching title |
| deepmind | https://deepmind.google/blog/ | HTTP 200, HTML and matching title |
| openrouter | https://openrouter.ai/blog | HTTP 200, HTML and matching title |
| elevenlabs | https://elevenlabs.io/blog | HTTP 200, HTML and matching title |
| langchain | https://www.langchain.com/blog | HTTP 200, HTML and matching title |
| vercel | https://vercel.com/blog | HTTP 200, HTML and matching title |
| google | https://blog.google/ | HTTP 200, HTML and matching title |
| github | https://github.blog/ | HTTP 200, HTML and matching title |
| nvidia | https://blogs.nvidia.com/ | HTTP 200, HTML and matching title |
| openai | https://openai.com/news/ | Web reader confirmed HTML page; direct HTTP request restricted or unavailable |
| anthropic | https://www.anthropic.com/news | HTTP 200, HTML and matching title |
| gemini | https://aistudio.google.com/docs/changelog | Browser confirmed HTML release notes; old ai.google.dev URL redirects here |
| deepseek | https://api-docs.deepseek.com/updates | HTTP 200, HTML and matching title |
| cursor | https://cursor.com/changelog | HTTP 200, HTML and matching title |
| figma | https://www.figma.com/release-notes/ | Web reader confirmed HTML page; direct HTTP request restricted or unavailable |
| huggingface | https://huggingface.co/blog | Web reader confirmed HTML page; direct HTTP request restricted or unavailable |
| simon | https://simonwillison.net/ | HTTP 200, HTML and matching title |
| revenuecat | https://www.revenuecat.com/blog/ | HTTP 200, HTML and matching title |
| techcrunch | https://techcrunch.com/category/artificial-intelligence/ | Web reader confirmed HTML page; direct HTTP request restricted or unavailable |
| verge | https://www.theverge.com/ai-artificial-intelligence | HTTP 200, HTML and matching title |
| cloudflare | https://blog.cloudflare.com/ | HTTP 200, HTML and matching title |
| supabase | https://supabase.com/blog | HTTP 200, HTML and matching title |
| n8n | https://github.com/n8n-io/n8n/releases | Web reader confirmed HTML page; direct HTTP request restricted or unavailable |
| indiehackers | https://www.indiehackers.com/podcasts | Browser confirmed podcast index and episode list; automated HTTP blocked |
| sspai | https://sspai.com/ | HTTP 200, HTML and matching title |
| showhn | https://news.ycombinator.com/show | Web reader confirmed HTML page; direct HTTP request restricted or unavailable |
| v2ex | https://www.v2ex.com/go/create | Web reader confirmed HTML page; direct HTTP request restricted or unavailable |

External sites may apply regional, login or bot restrictions. Passing this check is not a guarantee of future availability.

Design reference: https://www.wired.com/ — headline hierarchy, compact editorial rows and rule-based separation; existing original illustrations retained.
