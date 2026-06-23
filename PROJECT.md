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
