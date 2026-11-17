# P0 资讯质量系统

目标：看懂行业、改进工作、做好经营。来源权威程度不等于单篇结论已验证。

## 已实现的链路

`lib/news/sources.ts` 定义来源身份、用途、语言、采集方式、预期频率和迁移白名单。
`lib/news/collect.ts` 读取 RSS/Atom/索引/变更日志，获取文章正文，保存实际发布时间与采集时间。限制响应大小、超时、跳转、协议及私有网络地址。正文不足或访问挑战页不进入摘要生成。
`lib/news/policy.ts` 校验证据引用、分类和模型输出，按行业重要性或实际用途两条通道选择，平衡三个需求。引用匹配是基础门槛，不证明引用蕴含结论；人工必须继续核对。
`scripts/news/pipeline.ts` 做来源健康审计、正文版本入库、模型草稿和筛选原因归档。采集永不发布。
`/admin/news` 支持查看原文、修改标题/摘要/解读/证据、拒绝留档、恢复待审、合并、人工发布与下架。所有修改带版本锁；发布与审核日志为同一数据库事务。旧管理接口不能修改新链路管理的资讯。

## 来源策略

核心池：OpenAI、Anthropic、Gemini、DeepSeek、Cursor、Figma、Hugging Face、Cloudflare、Supabase、n8n。
实践/经营：Simon Willison、RevenueCat、Indie Hackers Podcast、少数派。HF 社区不等于官方；播客只有简介时不可据此生成经营结论。
行业报道：TechCrunch、The Verge。
发现：Show HN、V2EX，仅发现线索。新产品发布不能当成需求和收入验证。

旧来源处理：Product Hunt、BetaList、Reddit、GitHub 新仓库榜退出核心优先池；新链路不再给创始人天然优先权。旧 a16z、YC、BVP 报告采集保留为历史研究资料，不自动灌入新版精选。旧脚本与历史内容不删除。

本次实测只反映当前网络下可读性，不能直接证明 GitHub runner 可用。失败来源仍展示失败，绝不用二手摘要冒充原文。来源页面迁移需要明确修改白名单。只访问公开页面，不绕过登录、付费墙或挑战。

## 数据库部署

先在预发布数据库执行 `supabase/migrations/20261117090000_news_quality.sql`。
依赖已有 `radar_items`。新建的六张表均为私有 RLS，仅服务端访问；不修改或删除现有资料。
迁移包含 `review_news` 原子审核 RPC，以及保护新链路发布记录的 trigger。

需要环境变量：
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY（仅服务器/Actions）
- ADMIN_PASSWORD（采编台）
- ZHIPU_API_KEY（生成时）
- NEWS_MODEL 可选，默认沿用项目 glm-4.7-flash

本地：
```
npm run news:audit                  # 不写数据库，不调用模型；原文样本输出 output/news-audit
npm run news:collect -- --persist   # 保存来源健康和原文
npm run news:generate              # 保存来源/原文并生成待审，永不自动发布
npm run news:audit -- --sources=cursor,deepseek
```

输出包括时间戳 JSON、latest.json 和 latest.md。模型原始材料中的指令视作不可信文本；只接受符合结构且引用确实存在于原文的草稿。

## 启用生产

1. 应用迁移，配置服务端变量，部署代码。
2. 手动运行 News Quality Pipeline 的 audit；在生产 runner 验证来源健康。
3. 运行 collect / generate，进入 `/admin/news` 审核真实样本。
4. 连续试运行通过后设置仓库变量 `NEWS_PIPELINE_ENABLED=true`。
5. 此开关启用每天两轮新版采编，停用旧 daily-radar 自动链路与旧每周机会自动生成。旧机会手动操作仍可用。

回滚：将变量设为 false，停止新定时链路；新表与已审核资讯保留。无需删除新表或历史数据。不要通过旧后台修改新链路内容，仍从采编台退回审核。

## 验收与边界

- 无正文、伪造引用、未确认、过期版本不能发布。
- 同 URL/正文版本重复运行不会覆盖审核结果。
- 同事件键只允许一条发布；不同来源保留原始文档，可人工合并。模型事件键不是完美语义去重，人工必须核对跨语言/日期变化的重复。
- 来源运行日志记录抓取失败、空源、正文可读数和样本链接；采编台提示长期未运行。
- 采编台列表为最近100条/审核日志30条；更早记录保留数据库。P0尚不实现高级检索和全量报表。
- 关键数字和事实是否被全部覆盖，必须由编辑复核，不能用“引用出现过”取代事实核查。
- 未知日期不使用采集时间代替；旧内容留作资料。单页 changelog 可能含多期更新，须审核日期与实际新变化。
- UI为功能性采编台；公共资讯合流和完整设计系统属于后续P1/P2。

自动化测试使用真实 PostgreSQL 引擎 PGlite 执行迁移与审核事务，覆盖未授权读取、发布失败回滚、并发版本冲突、旧编辑入口拦截、下架重发不重复。

## 本轮验证结果

与最新主分支整合后，生产构建与 TypeScript 通过，全套155项测试通过。新增接口未授权 GET/POST 均返回401，采编台页面返回200。2026-11-17 已通过 Supabase SQL Editor 在目标项目应用事务迁移，页面返回 Success。迁移后真实云端采集完成：18源中15源取得正文，1条通过校验的草稿写入待审。模型接口大量返回429，另有结构/引文校验拦截，因此此结果仅证明链路打通，不代表稳定生产。已补充有上限的退避重试，并让模型请求失败明确影响任务状态。预览采编台登录、原文查看、修改保存和版本递增（v1→v2）已实测，未公开发布。定时任务尚未启用。

本次还修正了已有未提交 StepPlan.tsx 中一个 Pill tone 类型值（default 改为 neutral），其余已有用户改动保留。

本次完整信源实测：18个来源中，12个取得至少一篇可读正文。失败/仅线索来源：openai, gemini, huggingface, n8n, indiehackers, v2ex。最新明细见 output/news-audit/latest.md；该文件为本地检查产物，不应作为长期可用性承诺。
