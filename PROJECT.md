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
- **OPC Radar · 一人雷达**（/radar）：GitHub Actions `daily-radar.yml` — 每天北京时间 06:47 先跑 `scripts/fetch-sources.mjs` 抓取 HN/GitHub/RSS 素材入 `radar_candidates`，再跑 `scripts/generate-radar.mjs` 用 GLM 筛选写入 `radar_items`（默认 draft，人工在 /admin 审核发布后前台可见）。**主编口吻**：`scripts/style-samples.md` 里以 `- ` 开头的行会作为 few-shot 注入 editor_note 的 prompt（无有效样本时自动跳过），改样本直接 commit 即生效
- **审核台**（/admin，P3）：轻量审核页，登录用 `ADMIN_PASSWORD`（请求头 `x-admin-token`，localStorage key `ai_opc_admin_token`）。可批量发布/丢弃雷达 draft 和周报 draft、编辑后再发布，也可手动触发雷达抓取/周报生成（通过 GitHub workflow_dispatch）。**就地编辑**：管理员登录后，前台雷达卡片/周报文章卡片右上角出现 ✎（`components/admin-edit.tsx`，普通访客无 token 不渲染），弹层内保存/下架，保存后经 `app/api/admin/revalidate` 按需清除 ISR 缓存即时生效。API：`app/api/admin/review/route.ts`（GET 草稿+弃选列表）、`app/api/admin/publish/route.ts`（POST 发布/丢弃/下架）、`app/api/admin/edit/route.ts`（POST 编辑 radar/weekly/news_item，draft+published 均可）、`app/api/admin/trigger/route.ts`（POST 触发工作流）。**需要 Vercel 环境变量**：`SUPABASE_SERVICE_ROLE_KEY`（radar_items 开了 RLS，anon 只读）、`ADMIN_PASSWORD`、`GITHUB_PAT`（GitHub classic PAT，repo scope，用于手动触发）；页面无公开导航入口，自行收藏网址
