# PROJECT.md — AI OPC Weekly

> 每次新会话开始，读完这一页就知道怎么接手。

## 项目概要

- **仓库**: github.com/allenxie0510/ai-opc-weekly
- **技术栈**: Next.js App Router + TypeScript + Supabase + Vercel ISR
- **域名**: www.aiopcnews.com
- **本地路径**: /Users/allenxie/.openclaw-autoclaw/workspace/ai-opc-weekly/

## 新会话启动流程

1. `git log --oneline -5` — 了解最近做了什么
2. 读需要改的文件，不要全量读代码
3. 改完 → `npm run build` → commit → push → 结束
4. 一个会话只做一件事

## 文件结构

| 文件 | 职责 |
|------|------|
| `app/layout.tsx` | 全局布局、字体、不蒜子脚本 |
| `app/page.tsx` | 首页 → 重定向到最新周报 |
| `app/weekly/[slug]/page.tsx` | 周报详情 + footer（全宽黑底） |
| `app/weekly/[slug]/hero-section.tsx` | 周报 hero |
| `app/weekly/[slug]/filter-bar.tsx` | 分类筛选器 |
| `app/weekly/[slug]/share-bar.tsx` | 分享/下载 |
| `app/archive/page.tsx` | 归档页 |
| `app/favorites/page.tsx` | 收藏页（深度拆解提示词） |
| `components/article-card.tsx` | 项目卡片 + 收藏按钮 |
| `components/page-shell.tsx` | Header + Nav |
| `components/weekly-nav.tsx` | 上/下期切换 + 期数下拉 |
| `app/globals.css` | 全局样式（~320行，从旧站迁移） |
| `lib/data.ts` | Supabase 数据查询函数 |
| `lib/supabase.ts` | Supabase 客户端 |
| `lib/types.ts` | TypeScript 类型定义 |

## 关键约束

- **环境变量不提交** — `.env*` 在 `.gitignore`，Supabase 凭据在 Vercel dashboard
- **分类标签**: `micro-saas` / `design-assets` / `automation` / `content-monetize` / `indie-tool` / `digital-product`，中英文映射在 `CAT_LABELS`
- **收藏**: localStorage key = `ai_trends_favorites`，存完整 NewsItem
- **访问量**: 不蒜子 UV 统计，script 在 `layout.tsx`
- **品牌**: Bebas Neue、22px/600、letter-spacing 0.04em、蓝点 #1456f0
- **内容语气**: 周报面向公众，不用「你/你的」，客观第三人称
- **排版规范**: 内容块与黑色 footer 之间必须保留 56px 间距（`footer` 用 `margin-top:auto` 吸底，内容超一屏时 auto 会归零，兜底样式在 globals.css 末尾「内容与 footer 的统一间距」）；新增页面/区块时主动检查上下左右间距是否符合设计系统（`.container` 容器左右 32px / 移动端 20px，区块间距 56px）

## 定时任务

- **周报**：GitHub Actions `weekly-newsletter.yml` — 每周一 08:05–12:05 北京时间 5 个触发时段（防 scheduled 被跳过），调用 `scripts/generate-weekly.mjs` 写入 Supabase，Vercel ISR 刷新。自 W31 起改为三段式（快讯精选 + 深度拆解 + 本周弃选），素材来自 Radar 数据池（radar_items 近 7 天 published/rejected）+ GLM 联网检索，不再凭空生成；`WEEKLY_DRY_RUN=true` 可只打印不写入
- **推文**：GitHub Actions 每 2 小时执行 `scripts/fetch-tweets.mjs` 抓取 RSS.app feeds
- **OPC Radar · 一人雷达**（/radar）：GitHub Actions `daily-radar.yml` — 每天北京时间 06:47 + 19:47 先跑 `scripts/fetch-sources.mjs` 抓取素材入 `radar_candidates`。信源按 founder-first / enabler / context 三层管理（完整台账见 `RADAR-SOURCES.md`）：Show HN、Product Hunt、BetaList AI、Reddit r/SideProject、IH Podcast、RevenueCat 和独立开发者 X 为优先层；HN/GitHub/少数派为能力层；TechCrunch/The Verge/a16z/大公司 X 仅作低配额背景层。`scripts/generate-radar.mjs` 拉 72h 宽召回后由 `scripts/lib/radar-policy.mjs` 分层入模，并以 URL 溯源 + 五维 OPC fit + 单源上限 + 大公司每天至多 1 条做代码硬过滤；允许 0 条、每天至多 6 条，默认写 draft 供 /admin 审核。每条抓原文 OG 封面图。**主编口吻**：`scripts/style-samples.md` 中 `- ` 行作为 few-shot；策略测试运行 `npm run test:radar`
- **机会生产线**（Opportunities，重构 P1.1）：GitHub Actions `weekly-opportunities.yml` — 每周三 09:23 北京时间自动 + 手动触发。`scripts/generate-opportunities.mjs` 两段式：近 7 天 published radar_items 不联网聚类（每个机会必须 ≥3 条信号，不足本期不生成）→ 逐聚类 GLM 联网深研，产出 16 字段机会卡 + OPC Score 七维（代码加权算 score_total）+ Evidence Grade（代码按证据条数/tier 定级，0 条有效证据整篇拒收）+ Recommendation（BUILD/WATCH/NICHE_ONLY/SKIP 草稿）。案例收入数字执行"三件套"终审（revenue_source_url + claim_quote 齐全且 URL 可达，否则抹为"未披露"），evidence/case URL 逐个 HTTP 校验，source_tier 代码确定性映射。写入 `opportunities` 表 status=draft，关联 `cases` 表（按 name 去重）；editor_take 注入 style-samples 前 2 条做口吻
- **Reports Monitor · 低频信源周报**（P2.2）：GitHub Actions `reports-monitor.yml` — 每周四 10:17 北京时间自动 + 手动触发（审核台「⚡ 信源周报」）。`scripts/reports-monitor.mjs` 抓取 IH Podcast（Transistor RSS 8 期，Tier A）、RevenueCat（官方 rss.xml 10 篇，Tier A）、YC RFS（单页锚点解析 12 方向，Tier A）、BVP Atlas（列表页正则提取 10 篇，Tier B）写入 `radar_candidates`，由 daily-radar 的 GLM 筛选自然吸收；Carta 被 Cloudflare 拦截暂缓（台账见 REFACTOR-PLAN）
- **审核台**（/admin，P3）：轻量审核页，登录用 `ADMIN_PASSWORD`（请求头 `x-admin-token`，localStorage key `ai_opc_admin_token`）。可批量发布/丢弃雷达 draft 和周报 draft、编辑后再发布，也可手动触发雷达抓取/周报生成（通过 GitHub workflow_dispatch）。**就地编辑**：管理员登录后，前台雷达卡片/周报文章卡片右上角出现 ✎（`components/admin-edit.tsx`，普通访客无 token 不渲染），弹层内保存/下架，保存后经 `app/api/admin/revalidate` 按需清除 ISR 缓存即时生效。API：`app/api/admin/review/route.ts`（GET 草稿+弃选列表）、`app/api/admin/publish/route.ts`（POST 发布/丢弃/下架）、`app/api/admin/edit/route.ts`（POST 编辑 radar/weekly/news_item，draft+published 均可）、`app/api/admin/trigger/route.ts`（POST 触发工作流）。**需要 Vercel 环境变量**：`SUPABASE_SERVICE_ROLE_KEY`（radar_items 开了 RLS，anon 只读）、`ADMIN_PASSWORD`、`GITHUB_PAT`（GitHub classic PAT，repo scope，用于手动触发）；页面无公开导航入口，自行收藏网址
