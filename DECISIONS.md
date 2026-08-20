# DECISIONS.md · 关键决策记录

> 记录 aiopcnews 重要架构与产品决策的**为什么**。改相关代码前先读这里，避免丢失上下文重蹈覆辙。
> 每条决策包含：结论、理由、踩过的坑。

---

## 一、内容管线总览

```
信源拉取（HN/PH/GitHub/博客/Newsletter，每天 06:47 + 19:47 两轮）
  → 雷达 Radar（每日快讯，GLM 筛选，draft → admin 审核 → published）
  → 机会 Opportunity（信号聚类 ≥3 成机会，GLM 深研 + 主编拍板，每周生产线）
  → 周报 Weekly（深度信息，从本周雷达素材+联网搜索选真实案例，严禁编造）
  → 复评 Rescore（每周对已发布机会做信号复检 + 校准，P3 飞轮）
```

三层内容定位：**雷达 = 每日时效信号；周报 = 深度解读；机会 = 信号聚类后的可执行情报（本站核心差异化）**。

---

## 二、封面图管线（2026-08 定稿）

### 决策：两级管线

1. **Track 1 · og 原图优先**：从机会证据链 `evidence[].source_url` 抓 og:image，质量过滤后下载转存 Supabase Storage。真实感最强、零生成成本、与内容 100% 相关。全站保留来源链接是信任基础。
2. **Track 2 · Seedream 4.5 生成兜底**：无合格原图时才生成。**只用 `doubao-seedream-4-5-251128`，无任何回退模型；失败 cover_url 留 null 走前端渐变兜底——宁缺毋滥**（用户明确决策，不要恢复回退链）。

### 决策：prompt 规则（用户最终定稿，2026-08-12）

- **GLM 创意层只给核心规则，给大模型泛化空间**：内容驱动隐喻（从机会核心张力出发，让人看到图能联想到具体论点）+ 路线二选一（PHOTO 写实摄影 / ILLUSTRATION 扁平商业插画）+ 主体表面 blank & unmarked。
- **无任何内容禁令**：AI 行业元素（界面、芯片、全息、发光体）全部允许——同类网站也避免不了，这是行业本身的元素。曾加过"禁具象 AI 符号/文字载体"规则，用户决定删除。
- **唯一质检项 = 不出现崩坏文字**，靠 blank/unmarked 约束保障。
- **无负向提示词**：正向定义 > 负向禁令。实测 Seedream 对正向风格词服从度远高于负向约束；负向词尾置时模型照样画违禁元素。
- **不给具体元素参考**（电话/钥匙这类预设四档已删除）——预设会杀死内容相关性并导致撞题。

### 踩过的坑（不要再踩）

| 坑 | 结论 |
|---|---|
| GLM 场景提炼连续返回空 | `glm-4.7-flash` 默认开 thinking，`max_tokens=120` 被 reasoning 烧光。必须显式 `thinking: { type: 'disabled' }` + `max_tokens: 800` |
| 过度禁止 AI 元素 → "石器时代" | 禁令太狠时 GLM 全选吸尘器/陶罐/碎纸机等前工业物件。矫枉不能过正 |
| prompt 里出现 "magazine" | Seedream 会直接画一张带报头乱码的"杂志封面"。避免该词 |
| 物件表面不声明 blank/unmarked | 会出现伪品牌字（"Eaticn®"式乱码） |
| og 去重只按 URL | 不同文章引用同一张素材图（Getty）防不住 → 已加 sha256 内容哈希去重；同图不同编码仍有盲区，靠 `BLOCKED_IMAGE_URLS` 黑名单兜底 |
| 中文原文进生图 prompt | 模型会把原文当标注文字渲染进图。铁律：中文绝不进生图 prompt |

---

## 三、P3 飞轮（2026-08-12 全部落地）

### 设计意图

别的资讯站提供 Information，本站提供 **Decision Intelligence**。飞轮三块：**Score 历史（轨迹可回溯）→ Market Pulse（赛道有脉搏）→ Outcome Calibration（判断被校准）**。

### P3.1 Score 历史

- 表 `opportunity_score_history`（migration-002）：score 存 **0–10 一位小数**，`opportunities.score_total` 是 0–100，落 history 时 ÷10，回写时 ×10。
- 初评（`source='initial'`）机会生成时落库；存量用纯 SQL backfill（created_at 回溯到发布日）。
- 复评**无新相关信号时跳过不落记录**——没有理由的分数变化是噪音。这是有意的防噪音设计，不是 bug。

### P3.2 Market Pulse

- **纯读取侧聚合**（不建表、不加 workflow）：近 7 天 vs 前 7 天 rolling window，首页 ISR 刷新即最新。
- 分类直接用 `radar_items.category` 六分类（与机会共用）。
- 已知偏差：GLM 分类兜底 `indie-tool` 导致「小而美」桶偏大（观察项，暂未修）。
- 数据薄时（单分类 <5 条/周）±30% 阈值会被单条信号触发，读数统计意义有限，积累 1–2 周后有参考价值。

### P3.3 Outcome Calibration（校准判定标准三轮演进）

复评时 GLM 除打分外须回答"初评判断对了吗"（migration-003 加 `verdict` + `calibration_note` 两列）。

**判定标准演进史**（强制模式同一批弱相关信号实测）：

| 轮次 | 判定标准 | 分布 | 问题 |
|---|---|---|---|
| 初版 | 无严格标准 | 5✓/0◐/0⏳，分数全涨 | 永远确认的校准是装饰品 |
| 第二轮 | confirmed 需直接证实+点名信号 | 4✓/0◐/1⏳ | 证实的是周边主张而非核心论断 |
| **最终版** | **confirmed 必须直接证实 thesis 核心主张；周边主张最多 partially；reason 禁套话须点名信号；评分默认 stable，单次调整 ≤±0.5，禁止"行业氛围利好"上调** | **0✓/3◐/2⏳，分数全部不变** | ✅ 对弱相关信号的正确克制 |

**核心教训**：
- GLM 有天然"利好偏置"——不给严格标准时倾向确认一切、上调分数。校准的价值在于敢说"当初判断错了"。
- 禁套话约束要同时写进 `reason` 和 `calibration_note` 两个字段（只写一个另一个会残留）。
- 强制模式下 0 confirmed 是**正确**表现；有机模式（关键词粗筛后的相关信号）confirmed 会自然出现。

### RESCORE_FORCE 强制模式用法

- 用途：端到端验证校准链路（信号薄时正常模式会全部跳过）。
- 触发：Actions → Weekly Opportunities → `rescore_only=true` + `force_rescore=true`。
- 行为：跳过关键词粗筛，直接喂近 7 天 top 10 雷达条目；GLM 应对弱相关信号判 too-early/stable。
- **注意：强制测试会污染轨迹数据**。清理 SQL 见下（把日期换成测试当天）：

```sql
delete from opportunity_score_history
where source = 'weekly-rescore'
  and created_at >= '2026-08-12'::timestamptz
  and created_at <  '2026-08-13'::timestamptz;

update opportunities o
set score_total = round(h.score * 10)::int
from opportunity_score_history h
where h.opportunity_id = o.id and h.source = 'initial';
```

---

## 四、工程约定

- **Git 流**：beta 提交推送 → checkout main → merge beta（fast-forward）→ 推 main → 切回 beta。Vercel 生产走 main。
- **构建验证**：中文路径触发 Turbopack bug，必须复制到 /tmp 构建：
  `rm -rf /tmp/p-build && cp -R <repo> /tmp/p-build && cd /tmp/p-build && rm -rf .git && printf 'NEXT_PUBLIC_SUPABASE_URL=...\nNEXT_PUBLIC_SUPABASE_ANON_KEY=dummy\n' > .env.local && npm run build`
- **SQL 变更**：写 `migrations/migration-XXX.sql`（幂等），由站主在 Supabase SQL Editor 手动执行；脚本侧必须做"列不存在自动降级"容错，保证 migration 未跑时不崩站。
- **Workflow 手动触发**：`gh workflow run <file> --ref main [-f key=value]`；复评相关入口也在 admin 审核台。
- **宁缺毋滥原则**贯穿全站：生成失败留空走兜底、无数据不渲染占位、无新信号不落轨迹点、弃选内容前台不展示。

## 五、X 抓取源：RSS.app → Nitter 公共实例多实例降级（2026-08-19）

**背景**：RSS.app 付费订阅到期，全部 feed 返回 HTTP 402，/x 页面两天未更新（已有全灭 exit 1 报警兜住，未静默失败）。决定切换到免费的 Nitter 残存公共实例。

**实测数据**（GitHub Actions 美国环境三轮探测）：
- `xcancel.com/<username>/rss`：5/5 测试账号（tbpn, shadcn, marckohlbrugge, AliAbdaal, robertsirc）全部 200 且内容新鲜。**必须用 RSS 阅读器 UA**（`FreshRSS/1.24.0`），浏览器 UA 返回 400。
- `nitter.net/<username>/rss`：部分账号 200、部分 404，作兜底。
- nitter.poast.org（403 POW）、nitter.privacyredirect.com（404）、RSSHub 公共/镜像：全部不可用，已排除。

**机制**：`scripts/fetch-tweets.mjs` 不再依赖 `twitter_accounts.rss_url`，遍历所有账号，每账号按序尝试 `xcancel.com → nitter.net → rss_url（非 rss.app 的可选兜底）`，第一个 200 且解析 ≥1 条的源胜出；账号间 sleep 1.5s。解析器适配 Nitter 格式（title 纯文本需 unescape、guid 提取 tweet_id、description `<img src>` 只收 `/pic/` 媒体图、url 统一重写为 x.com 链接）。

**风险与对策**：
- 公共实例随时可能失效或被 X 封锁 → 保留"全部账号失败 exit 1 标红"报警，全灭时 Actions 会红，届时再换源（候选：自建 Nitter、RSSHub 自建、其他新实例）。
- 单实例失效有降级链兜底，部分失败仅 warn 不阻塞。
- `rss_url` 列保留，作可选高级兜底（管理后台已改文案）。

### 补记（2026-08-19 上线当日实测修正）

首次上线后全灭，三轮 Actions 内探测修正事实：
- **xcancel.com 已转为 RSS 阅读器白名单制**：返回 200 但内容是 "RSS reader not yet whitelisted" 占位 item（需邮件 rss@xcancel.com 申请，附响应中的 ID），随后转为 302。保留在降级链末位，白名单恢复后自动启用。
- **nitter.net 按 TLS 指纹拦截 node fetch**：node fetch 拿到 200 空 body，curl 同 URL 4/4 全通。抓取改用 `execFile('curl', ...)` 发请求。
- **nitter.privacyredirect.com 可用但限流敏感**：单发 200，连续请求 503/502，降为第二兜底。
- 最终源序：`nitter.net → nitter.privacyredirect.com → xcancel.com → rss_url 兜底`，账号间延时 2.5s。上线验证 15/15 账号成功、271 条写入、/x 页面恢复更新。
- 脚本保留 `FETCH_DEBUG=1`（repo variable 控制）诊断输出，实例再次变异时可快速定位。

### 补记 2（2026-08-19）：抓取核心共享化 + admin 手动刷新迁移

- **共享模块**：Nitter 抓取核心（多实例降级 / curl 抓取 / 解析器）抽为 `lib/nitter-fetch.mjs`（纯 ESM JS，无 TS 语法），`scripts/fetch-tweets.mjs` 与 `app/api/admin/refresh/route.ts` 共用，杜绝两份逻辑 drifting。route 侧经 `@/lib/nitter-fetch.mjs` import（tsconfig `allowJs: true`）。
- **Vercel curl 可用性（实测）**：生产 serverless 为 Node v24.18.0 / Amazon Linux，自带 `curl 8.17.0`（经 `/api/ping?diag=1` 验证）。共享模块仍以 `hasCurl()` 探测，缺失自动退化 node fetch + 空 body 判败走降级链。
- **route 适配 serverless**：并发 4 路、单源 8s 超时、`maxDuration = 60`；鉴权（X-Admin-Token）与响应格式不变，results 增加 `source` 字段便于观察实例命中。
- **未走 workflow_dispatch 方案**：curl 实测可用，直接抓取最简单可靠；dispatch 方案（响应慢、按钮体验差）仅作备选记录。
- 回归：重构后 Actions 抓取 14/15 成功（@shadcn 三实例同瞬 404，瞬时抖动，部分失败语义正确兜底）。

### 补记 3（2026-08-19）：图片 502 根因——/pic/ 代理 URL 还原 pbs 直连

- **现象**：迁移 Nitter 后推文有图但前端图片全挂。
- **排查**：真实 feed 探测确认解析器提取无问题（img src 就是绝对路径 `https://nitter.net/pic/...`，与样例一致）；根因在 img-proxy——它用 node fetch 拉上游，nitter.net 按 TLS 指纹拦截 node fetch → 502。同图的 pbs.twimg.com 直链代理 200 正常。
- **修复**：`lib/nitter-fetch.mjs` 新增 `resolveImageUrl()`——nitter 的 /pic/ 路径即 pbs.twimg.com 路径的（多层）URL-encode，解码还原为 pbs 直连。双写：① 解析器写库前还原（新数据直接存 pbs URL）；② img-proxy 拉上游前还原（兼容库里 Nitter 时代旧行，upsert ignoreDuplicates 不会更新旧行）。
- **附带**：unescapeXml 补 `&apos;`（karpathy 标题实测含此实体）。
- **验证**：/x 页面 46 个真实 `<img>` 代理 URL 全部 200 image/*（含旧 nitter 链接与新 pbs 链接）。
- **观察**：nitter.net 对单账号存在瞬时 404 抖动（shadcn/OpenAI/steipete 各出现过一轮，下一轮自愈），降级链 + 部分失败 warn 语义按设计兜住，无需处理。

## 六、设计系统（P1 收口，2026-08-19）

三项收口：分数统一 / 板块节奏 / 颜色收口。只动视觉层，不改信息架构与文案。admin 后台未纳入（优先级低）。

### 分数：ScoreBadge 单组件 + 0–100 量纲

- **唯一组件** `components/score-badge.tsx`：三变体 `cover`（卡片封面右上浮层）/ `inline`（文本流徽章，首页 hero）/ `text`（雷达卡标题行尾纯文字）。删除旧的三套重复规则（`.opcard-score` / `.home-hero-score` / `.radar-title-score`）。
- **色阶**（`--color-score-*`，同一映射全站复用，含详情页总分、七维条、轨迹历史分）：≥80 优秀绿（=--color-up）/ 60–79 良好蓝 #1456f0 / 40–59 一般琥珀（=--color-warn）/ <40 弱灰 #75757b。色阶只染数字 `.sb-num`，"OPC" 前缀恒 stone 灰。
- **量纲统一 0–100**：评分轨迹内部存储仍是 0–10，展示层一律 `toDisplayScore()` ×10（轨迹首末分、历史条目、±变化阈值 ±0.5→±5）；详情页轨迹副标题标注「0–100 制」。所有分数 `title` 带统一图例 `SCORE_SCALE_TEXT`。
- **例外**：explore 模块的 1–10 分是 wizard 工具内部口径，不纳入全站分数系统。

### 板块节奏：间距 token + .page-wrap

- **间距 token 三档 + 页距两档**：`--space-section: 56px`（大板块）/ `--space-subsection: 40px`（详情页子板块）/ `--space-block: 24px`（标题与内容）/ `--space-page-top: 48px` / `--space-page-bottom: 80px`。消灭 48/56/64/80 混用。
- **`.page-wrap` 类**统一页面容器页距，替换 home/radar/opportunities/详情/explore/x/x-accounts/archive/favorites 各页的 inline `paddingTop/paddingBottom`（archive/favorites 原 64px 底距统一为 80）。
- home 与 weekly 的 section-title 原为两份相同定义，已合并（weekly 保留自身 margin-bottom:20px）。

### 颜色：语义 token 收口

- **语义映射**：橙 #ff5530 = 品牌强调唯一高饱和色；绿 --color-up #0a7d4f = 正向/上升；红 --color-down #dc2626 = 负向/下降；琥珀 --color-warn #b45309 = 警示；红 --color-danger #b91c1c = 危险操作；灰 = 中性；领域/分类标签中性灰；状态标签固定语义色。
- **token 化**：globals.css 中硬编码 #0a7d4f/#b45309/#b25e09/#b91c1c/#c0392b/#7c3aed/#fafafa/#fff 底全部替换为 var()；x/accounts 与 market-pulse 的内联 hex 同步 token 化；补定义了 admin 样式引用但从未定义的 `--color-mist`（latent bug，边框此前退化为 currentColor）。
- **对比度**：--color-stone 由 #8e8e93 加深至 #75757b（白底对比度 3.0→4.6:1，达 AA）；x-card-handle 等次级文字同步用 stone。
- **例外**：OpportunityCard `FALLBACK_THEMES` 封面插图配色是装饰性程序生成色（非语义标签），保留硬编码 hex；explore 模块 PDF 模板样式独立，不纳入。

### 教训与工具备注

- **replace_all 误伤**：对 hex 做全局替换时把 @theme 里 token 定义自身也替换成了 `var(--color-up)` 自引用循环，导致色阶整体失效（部署后截图发现 81/88 分未着色）。教训：token 定义行必须先于批量替换落地并复查，`--color-x: var(--color-x)` 模式应入检查清单。（修复 commit df3dfe1）
- **headless Chrome 移动端截图假象**：macOS headless Chrome `--window-size=390` 低于最小窗口宽，实际按 ~500px 布局再裁切到 390，截图呈现"全页面右侧裁切"的假溢出。实测（同源代理 + iframe 注入测量）线上页面 390px 下 `scrollWidth=390` 无任何溢出元素。**移动端验证用 `--window-size=500` 截图或注入测量，不要用 390 直截**。

### 补记 4（2026-08-19）：Vercel 手动刷新全灭根因——实例对机房 IP 硬拦截 + 兜底源连击限流

**现象**：/x/accounts 点「手动更新」返回「写入 0 条，18 个 feed 失败」，同时段 Actions 定时抓取正常。

**证据链**：
- Actions 最近三轮 schedule 全成功，最新一轮（08:25 UTC）16/18 账号经 nitter.net（curl）写入 289 条；仅 2 个账号级 404（@soren_iverson/@yihui_indie 改名或保护，与本问题无关）。→ 实例侧健康，问题为 Vercel 环境特有。
- 用户拿到的是完整 JSON 响应（"0 条/18 失败"），不是 FUNCTION_INVOCATION_TIMEOUT。→ 排除 maxDuration=60 截断（最坏 18/4 并发 × 3 源 × 8s ≈ 108s 才会超时，超时不会有正常响应）。失败是**快速**的。
- 新增 `/api/ping?diag=nitter`（白名单三实例、curl 只回状态码/字节数/耗时，非开放代理）从 Vercel 实测：
  - `nitter.net`：**HTTP 000 / curl exit 92（HTTP/2 stream reset）/ 387ms** —— 对 AWS 出口 IP 硬拦截（对该站 TLS 指纹拦截的第三种形态：node fetch=200 空 body、Actions curl=放行、Vercel curl=流重置）。
  - `nitter.privacyredirect.com`：单发 HTTP 200 / 27.9KB / 1189ms —— 可达，但已知连击限流（连续请求 503/502）。
  - `xcancel.com`：302（RSS 阅读器白名单制，未变）。
- **根因结论**：① nitter.net 硬拦 Vercel/AWS IP（首选源全灭，~0.4s 快速失败）；② 18 账号以 4 并发瞬时涌向第二兜底 privacyredirect → 触发其限流 503；③ xcancel 白名单 302。三源全死 → 18/18 全灭。**不是用户操作频率问题**（单发与并发对 nitter.net 的拦截无影响）。

**决策**：
- `/api/admin/refresh` 直连全灭时自动 `workflow_dispatch` fetch-tweets.yml（复用 trigger 路由的 GITHUB_PAT 模式），由 Actions 环境完成抓取（异步 2-3 分钟），响应带 `fallback` 字段。这是补记 2 记录的 dispatch 备选方案的正式启用场景——Vercel 直连仍先尝试（拦截解除即自愈），全灭才兜底。
- 刷新接口错误透明化：每账号 `error`（含各源 HTTP 码）前端可展开查看，不再只有失败计数。
- 部分失败不触发兜底（成功账号正常写入，失败账号等下一轮 Actions 覆盖）。
- 遗留：xcancel 白名单申请（邮件 rss@xcancel.com 附 ID）仍建议发，多一个健康源；privacyredirect 的限流敏感意味着它不适合做 Vercel 侧的主源。

### 补记 5（2026-08-20，属封面管线）：GLM 场景提炼无兜底模型 → 429 时段封面必丢

**事件**：新机会「本地AI开发工具」发布无封面（cover_url=null，前端渐变兜底）。

**根因（日志证据）**：生成运行（08-20 02:27 UTC，dispatch 32324681979）中 Track 1「无合格 og:image 原图」→ Track 2 场景提炼 `GLM 429: {"error":{"code":"1305","message":"该模型当前访问量过大"}}` →「GLM 场景提炼彻底失败——宁缺毋滥，cover_url 留空」。同一时段 glm-4.7-flash 全管线拥挤（聚类/Stage2/复评均 429 后切兜底模型），唯独封面链路的 deriveScene **没有兜底模型**（主线 GLM_MODELS=[4.7-flash, 4.5-flash] 的切换逻辑没覆盖到它）。修复后回填运行再次复现：4.7-flash 429 三连 → 切 4.5-flash 一次成功 → Seedream 出图 → 回写。与 Seedream/ARK key/额度/内容审核均无关。

**修复**：
- `scripts/lib/cover.mjs` deriveScene 改为模型链 `['glm-4.7-flash','glm-4.5-flash']`：主模型 429 三连或裸重试 429 均切兜底，日志带模型名。风格规则/prompt 不变（8-12 定稿保持）。
- **admin 自助补封面**：`/api/admin/trigger` 新增 `workflow=backfill-covers`（透传 `clear=slug`，格式校验）；admin 机会草稿/已发布行加「🎨 补封面/重生成封面」按钮（dispatch backfill-covers.yml，密钥不出 Actions）；review 接口补 select cover_url。用户遇封面缺失可一键补救，无需找开发。
- 日志充分性：封面链路原有日志已能定位到步骤级（og 未命中/GLM 429/留空），本次只补了模型名维度，未新增日志点。

**验证**：回填运行 32327537004 成功，封面 `covers/opp-local-ai-development-tools.png`（PHOTO 路线：悬浮发光立方体工作站），线上详情页/列表已显示。


---

### 补记 6（2026-08-20，属封面管线 / 二）：封面风格统一为「编辑插画 · 概念隐喻风」，PHOTO 路线下线

**起因**：用户挑选 8 张理想封面参考图，风格共性非常鲜明——颗粒/点画纹理、哑光印刷纸感、有限配色（浅底 + 藏蓝主形 + 单一暖橙/金色点缀）、大量留白、单一视觉焦点、以尺度对比（小人物 vs 巨大之物）叙事 AI 与个体的关系。用户裁定新风格方向：**「编辑插画 · 概念隐喻风」**，旧封面里 Seedream 生成的 4 张全部重生成（9 张文章 og 原图不动）。

**风格模板（生成 prompt 固定前缀，一字未改的定稿版）**：

```
Editorial magazine illustration, conceptual metaphor. ${scene}. Flat shapes with visible grainy stipple texture, printed-paper matte feel. Limited palette: light off-white or soft pastel background, navy-blue dominant shapes, exactly one warm accent (burnt orange or golden yellow). Generous negative space, single clear focal point. No text, no letters, no numbers, no logos, no watermarks anywhere in the image.
```

**双层 prompt 分工（沿用补记 4 的架构）**：
- **场景层（GLM）**：续期时从标题/主题/SKILLS 提炼一个概念隐喻场景。本次改动：去掉「PHOTO / ILLUSTRATION 二选一」的路线决策（`deriveScene` 不再返回 route），只生成场景句；新增明确引导「当内容涉及 AI 与个人/小团队的关系时，优先考虑尺度对比叙事（小人物 vs 巨大之物）」；保留 blank/unmarked surface 无文字约束与中文不进 prompt 的既有规则。
- **风格层（模板）**：上面的固定英文前缀包住场景句。

**改动**：`scripts/lib/cover.mjs`（`buildCoverPrompt(scene)` 换签名换模板、`deriveScene` 去路线、GLM rules 更新；`size`/`quality` 入参成为历史遗留静默忽略）。调用方只有 generateOpportunityCover，无需同步改。构建零错误通过；代码推送 beta `64712c5` / main `220c7f5`。

**批量重生成**：backfill-covers `clear=<4 个 slug>` 触发，同名 upsert 覆盖，无孤儿文件。**过程中发现模板措辞坑（重要教训）**：模板开头的 "Editorial magazine illustration" 会被 Seedream 字面理解为「杂志版面」，实测约 40-50% 概率在画面里渲染假刊头/乱码段落文字（6 次生成 3 次崩坏，模板尾部的 "No text" 约束不足以压制）。4 张封面历经三轮重掷才全部干净（autonomous 崩 2 次、workflow 崩 1 次）。**对策现状**：靠重掷（admin 后台「重生成封面」按钮可自助）；**待用户定夺的优化**：把模板开头改为 "Editorial-style conceptual illustration" 之类不带 "magazine" 字样的措辞预计可显著降低崩坏率，但模板是用户冻结的「一字不改」，故本次未动。

**ISR 注意**：backfill 的 clear→置 NULL→再生成约 2 分钟窗口内，若恰逢列表页 ISR 渲染，会缓存程序化兜底态封面；属自愈现象（≤5 分钟自动恢复），验证线上封面时遇兜底态应先等 ISR 过期重截再下结论。

**验证**：4 张新封面逐张目检干净（无文字崩坏），线上列表页 + 首页 headless Chrome 截图确认全部正确显示，9 张 og 原图不受影响。


---

### 补记 7（2026-08-20，属封面管线 / 三）：风格模板二次修订——去 magazine 措辞、配色放开、小人物不再硬性植入

**起因**：补记 6 模板实测暴露三个问题，用户批准三点修订：
1. **"Editorial magazine illustration" 开头被 Seedream 字面渲染成假刊头/乱码**（实测崩坏率 ~50%，6 次生成 3 次崩）→ 改为 "Editorial-style conceptual illustration"。
2. **藏青太深、暖强调色总是橙色** → 配色放开为 2-4 柔和色（米白/桃粉/浅蓝/浅绿底 + 中蓝主形（非深藏青）+ 每图可变暖强调色（burnt orange / golden yellow / coral / warm pink）），允许双色渐变。
3. **GLM 尺度对比引导执行太死，张张都有小人** → 场景层改为「隐喻优先从内容具体张力出发自由发挥：人物场景/静物/抽象构图/空间关系均可，不要默认植入人物；仅当"个体 vs 巨大之力"的尺度对比真正契合论点时才使用」。

**新模板全文（定稿）**：

```
Editorial-style conceptual illustration. ${scene}. Flat shapes with visible grainy stipple texture, printed-paper matte feel. Limited palette of 2-4 soft colors: light background (off-white, soft peach, pale blue or pale green), medium-blue dominant shapes (not dark navy), one warm accent that varies per image (burnt orange, golden yellow, coral or warm pink); subtle two-color gradients allowed for depth. Generous negative space, single clear focal point. No text, no letters, no numbers, no logos, no watermarks anywhere in the image.
```

**改动**：`scripts/lib/cover.mjs`（buildCoverPrompt 模板 + deriveScene rules 一条替换，其余规则不变：blank/unmarked、无文字、只输出 1-2 句英文、双模型链）。构建通过；beta `b0878f6` / main `a419205`。

**实测效果（4 张全部重生成验证）**：
- **magazine 崩坏修复确认**：5 次生成（4+1 重掷）无一例假刊头/杂志版面；但有 1 例新型崩坏——GLM 场景句自带 "AI processing core" 导致 Seedream 在芯片上渲染发光 "AI" 字母（文字禁令被场景层内容击穿），重掷 1 次后干净。教训：**文字崩坏风险不仅来自风格模板措辞，也来自 GLM 场景句里的 "AI" 字样**——后续若崩坏率仍高，可考虑在场景层 rules 加「场景描述中不要出现 AI 字样」。
- **配色分布**：4 张均为米白/浅蓝底 + 中蓝主形 + 橙/桃暖强调，其中 1 张出现彩虹渐变光束（双色渐变条款生效）；不再全是深青+橙。
- **人物出现情况**：4 张场景全部为静物/抽象构图（棱镜折射、悬浮界面+发光核心、透明服务器机架、服务器+网络连线），无一硬性植入小人——去硬性引导生效。
- GLM 场景提炼本轮 429 频发（4 条里 3 条走 glm-4.5-flash 兜底模型），双模型链按设计工作。

**验证**：4 张逐张目检干净（1 张局部放大复核）；线上列表页 + 首页截图确认 4 张新封面全部正确显示（列表页曾命中 ISR 缓存兜底态，~5 分钟自愈后重截确认）。


---

### 补记 8（2026-08-20，属封面管线 / 四）：风格模板三次修订（用户亲定）——配色决策权上移 + 文字政策放松

**起因**：二次修订实测稳定后，用户亲自改定模板，两个方向性变化：①配色决策权进一步上移（主色按场景气质、每张不同；背景从 4 个浅色里随机 1-2 个）；②**文字政策从「禁一切文字」放松为「只禁中文/标志/水印」**——用户明确允许封面出现与主题相关的英文单词（如 AI、Agent），认为有助于传递概念。

**新模板全文（用户亲定，逐字实施）**：

```
Editorial-style conceptual illustration. ${scene}. Flat shapes with visible grainy stipple texture, printed-paper matte feel. a dominant color chosen to fit the scene's mood, varying across images; randomly select 1-2 soft colors: light background (off-white, soft peach, pale blue or pale green), subtle two-color gradients allowed for depth. Generous negative space, single clear focal point. No chinese text, no logos, no watermarks anywhere in the image.
```

**GLM 场景层（deriveScene）同步对齐**：
- 原「视觉主体必须完全空白无标记（blank, unmarked），任何文字或类文字纹理都不能出现」改为「视觉主体表面保持干净（无蚀刻、印刷、标签、刻度等装饰性假文字）；如有助于传递概念可出现少量主题相关英文单词（如 AI、Agent），必须拼写正确、是构图的有机部分；绝不出现中文」。
- 新增明确措辞规则：场景描述里包含要渲染进画面的英文单词时，用 `with the word "AI" on...` 这类措辞，避免 Seedream 把描述性文字误渲染（补记 7 发现的场景层击穿文字禁令问题的正式解法）。
- 裸重试 prompt 同样放松对齐。

**实测效果（4 张全部重生成，一轮 4/4 零崩坏，无重掷）**：
- **文字使用**：3 张自然融入正确拼写的英文单词（AI / INDIE / LOCAL），1 张纯静物；无中文乱码、无假刊头、无装饰性假文字。
- **配色分布**： pastel 渐变底（桃粉→浅绿）+ 浅蓝底 + 蓝粉渐变底各不同，主色按场景气质分化（暖桃/亮蓝/深青黑），不再统一蓝。
- **风格统一性保持**：颗粒质感、扁平造型、大留白、单一焦点全部在位。
- 崩坏率：本轮 4 次生成 0 崩坏（样本小，但对比一版 ~50%、二版 1/5 已是显著改善）；GLM 429 兜底链仍按设计工作（1 条走 glm-4.5-flash）。

**改动**：`scripts/lib/cover.mjs`（buildCoverPrompt 模板逐字替换 + deriveScene rules/bare 对齐）。构建通过；beta `a202365` / main `d27340d`。**验证**：4 张逐张目检 + 线上列表页/首页截图确认（本次 ISR 窗口未命中兜底态，一次截图即确认）。


---

### 补记 9（2026-08-20，属封面管线 / 五）：风格模板四次修订（用户亲定）——背景固定单色、渐变限定主体元素

**起因**：三次修订实测发现渐变条款漏到背景上（多张封面背景呈双色渐变），用户亲定四次修订收口：①背景固定单色（Monochrome background）；②配色池只管强调色（medium-blue / off-white / soft peach / pale blue / pale green 随机 1-2 个）；③双色渐变限定在主体元素内（"within the subject elements" 为用户确认过的微调落点限定）。

**新模板全文（用户亲定，逐字实施）**：

```
Editorial-style conceptual illustration. ${scene}. Flat shapes with visible grainy stipple texture, printed-paper matte feel. a dominant color chosen to fit the scene's mood, varying across images; Monochrome background; randomly select 1-2 Accent colors(medium-blue , off-white, soft peach, pale blue or pale green), subtle two-color gradients allowed within the subject elements for depth. Generous negative space, single clear focal point. No chinese text, no logos, no watermarks anywhere in the image.
```

**实测效果（4 张重生成，5 次生成 1 次崩坏）**：
- **背景单色验收**：4 张最终版全部通过（纯黑 / 米白 / 桃粉 / 深蓝各一）。首轮 development-tools 背景仍为蓝→桃渐变、且显示器渲染出清晰 Apple logo（违反 no logos），重掷 1 次后干净（桃粉单色底 + 渐变限定在 AI 球体内）。**教训：渐变漏背景的概率显著下降但仍存在；logo 是新观察到的崩坏类型（真实品牌 logo 渲染），重掷可解。**
- **文字政策**：英文单词自然融入且无拼写错误（AI Agent / Local AI / Privacy + Local + AUTOMATION / AI），无中文乱码、无假刊头。
- **配色分布**：4 张主色/背景组合全不同（黑底+蓝绿渐变主体 / 米白底+蓝脑+彩纸 / 桃粉底+蓝绿窗格 / 深蓝底+金文件夹），多样性保持。
- 崩坏率本轮 1/5（20%），介于二版与三版之间；GLM 429 兜底链正常工作（2 条走 glm-4.5-flash）。

**改动**：`scripts/lib/cover.mjs`（仅 buildCoverPrompt 模板逐字替换，GLM 场景层不变）。构建通过；beta `8fb910c` / main `eb068ff`。**验证**：4 张逐张目检（1 张重掷）+ 线上列表页/首页截图确认。

**补记 9 追加（2026-08-20）**：渐变子句按用户批准改为 `gradients ONLY on the subject, background stays flat solid color`（替换 "subtle two-color gradients allowed within the subject elements for depth"），仅改代码、不重生成现有封面，下次新生成时启用。


---

### 补记 10（2026-08-20，属雷达管线）：小而美桶偏大根因——无边界桶定义 + 兜底倒最大桶；新增「其他」桶

**观察项**：雷达分类疑似兜底逻辑把过多条目倒进「小而美」（indie-tool）桶。

**实测分布**（/radar 页 = 近 14 天 published，共 27 条，按卡片级精确计数）：小而美 11（40.7%）/ 微SaaS 8（29.6%）/ 内容变现 3 / 自动化 2 / 虚拟产品 2 / 设计资产 1。小而美确为最大桶且占比异常。

**根因（双因叠加）**：
1. **桶定义零边界**：分类 prompt 只给 slug 列表（`必须是以下之一: micro-saas / ...`），无任何定义与例子。indie-tool 语义上是「独立开发者工具」万金油——与站点主题（独立开发者 AI 工具）天然重合度最高，GLM 无边界指引时默认往最宽泛的桶塞。
2. **兜底倒进最大桶**：`category: String(it.category || 'indie-tool')`——GLM 缺字段时直接落入小而美；且 category **无白名单校验**（同函数里 signal_type 有 includes 校验 → 'product'，category 没有，属于不对称疏漏）。实测窗口内未发现非法值（27 卡标签全命中），说明主因是 prompt 侧倾向，兜底是放大器。

**修复**：
- `scripts/generate-radar.mjs`：prompt 补 7 桶定义（每桶一句边界 + 1-2 个例子），明确 indie-tool 「仅当前四类都不沾边时使用，不要把所有工具都归这里」；新增 `other`（其他/无法判断）桶；写入侧改白名单校验，缺失/非法值 → `'other'`，不再兜底 indie-tool。
- `lib/types.ts`：Category 联合类型 + CATEGORY_MAP 加 `'other': { label: '其他', cssClass: 'cat-other' }`；`app/globals.css` 共享 pill 选择器加 cat-other；admin 编辑链路（edit route 白名单 + admin-edit 下拉）同步加 other。
- **机会管线（generate-opportunities.mjs）存在同款兜底**（VALID_CATEGORIES includes → 'indie-tool'，两处），本次未动——机会条目量小且有人工 review 环节，如后续观察机会分类也失衡再同样处理。

**不回填旧数据**：旧条目重分类需逐条过 GLM，成本不低且历史分布不影响新条目质量，故不动；新分布从下一次雷达生成（每日 07:00）开始生效。

**验证**：构建通过（Record<string,...> 映射不受新增枚举影响）。

---

### 补记 11（2026-08-20，属设计系统）：移动端导航挤压换行——方案 A（单行可横滑）

**现象**：用户在手机端反馈头部导航换行。真 390px 实测（见下）确认：nav-inner 为 flex 不定宽不 nowrap，8 个导航元素（logo + | + 机会/方向/雷达/X + 归档/关注）总宽 ~470px 超出 390px，被 flex-shrink 挤压——logo 断成两行、双字标签竖排、点击区塌小。

**诊断方法（重要，纠正补记 3 的结论）**：macOS headless Chrome 最小窗口宽 500px 的限制在 `--headless=new` 下依然存在，`--force-device-scale-factor=2` 也无效（innerWidth 实测仍 500）。**可靠做法：本地 wrapper 页套 390px 宽 iframe 指向目标页，再截 wrapper**——iframe 内是真实 390px 布局，无裁切假象。

**方案选择**：A（单行横向滚动）优于 B（汉堡收起次要项）——全部项仅 8 个短词、紧凑化后 390px 恰好放下，横滑只作为更窄屏/系统大字体用户的兜底；不引入 JS 交互复杂度。归档/关注不收起，保持全可达。

**实施**（globals.css `@media (max-width: 768px)`）：nav-inner `flex-wrap:nowrap + overflow-x:auto + 隐藏滚动条 + -webkit-overflow-scrolling:touch + 右端 28px 渐隐 mask`；所有链接 `white-space:nowrap + flex-shrink:0`；紧凑化（x-link 15px/padding 10px 6px，次要项 13px/10px 10px，纵向 padding 加大兼顾点击区）；`.nav-links { margin-left:auto }` 保持放得下时右对齐。

**附带检查**：首页/机会列表/机会详情/雷达/X 五页 390px 正文均无横向溢出、无贴边，未发现其他需修的移动端问题。附带发现：中文路径下 `next dev`（Turbopack）因非 ASCII 路径 char-boundary bug 起不来，本地开发需复制到 ASCII 路径（/tmp/p-dev）。

---

### 补记 12（2026-08-20，属探索模块 / 信息架构）：登录态上移全局 header，AI 设置入「我的探索」，探索页胶囊防竖断

**起因**：用户手机端体验方向探测器，工具栏 6 颗胶囊（探索引擎/方法论/📁我的探索/邮箱大黑胶囊/⚙️AI设置/清空）在 390px 下挤压——胶囊文字逐字竖排断裂，登录邮箱黑胶囊占工具栏中间挤压其他按钮。

**信息架构决策**：
- **登录/注册 → 全站 header**（page-shell AuthSlot）：未登录显示紧凑「登录」文字链 → `/explore?login=1`（ExploreApp 用 window.location.search 读取并自动开登录弹窗，避开 useSearchParams 的 Suspense 要求）；已登录显示 28px 邮箱首字母圆形头像，点击展开菜单（邮箱全文 / 我的探索 / 退出登录）。**菜单用 position:fixed 定位**——header 移动端 overflow-x:auto 会裁剪 absolute 下拉。
- **AI 设置 → 「我的探索」弹窗内**（SessionsModal 加 onOpenConfig 入口，ghost 小按钮），从探索页一级工具栏移除。
- **清空**：保留功能，降为 ghost 文字钮（无边框低饱和，hover 才显 danger 色）。
- **探索页胶囊**：`.xpl-tab` white-space:nowrap + flex-shrink:0（单颗内文字绝不竖断），`.xpl-tabs` 改 flex-wrap:wrap（容纳不下时整颗换行）。

**联动调整**：昨日（补记 11）给移动端 nav-inner 加的右端 28px 渐隐 mask 会淡化右边缘的头像/关注按钮，本次移除——滚动提示靠边缘胶囊自然裁切。

**验证**：本地 dev 真 390px（iframe 法）+ 桌面端截图确认；构建通过。已知限制：本地无 Supabase env，登录后头像态无法在本地截图验证，靠线上真实账号确认。

---

### 补记 13（2026-08-21，属信息架构）：归档/关注从 header 一级导航收进登录态头像菜单

**起因**：补记 12 把登录态上移全站 header 后，header 一级导航仍有 8 项（logo + | + 机会/方向/雷达/X + 归档/关注 + 登录），其中「归档」「关注」是个人内容入口而非全站内容导航，与登录态同属"我的"语义，收进头像菜单更合理，同时进一步给移动端 header 减负。

**决策**：
- header 一级导航只剩全站内容项：logo + 机会/方向/雷达/X + 登录（匿名）或头像（登录态）。匿名访客不再看到归档/关注入口。
- AuthSlot 下拉菜单最终结构（图标统一放 18px 固定宽度槽位 `.nav-auth-ico` 保证文字列对齐，分隔线分组）：
  - 邮箱全文（顶部队列，自带下边框）
  - 内容入口组：📁 我的探索 / 📥 归档 / ⭐ 关注（保留原 header 的 localStorage 计数徽章，重构为独立 `FavBadge` 组件，flex 行内 margin-left:auto 靠右）
  - `─` 分隔线（`.nav-auth-divider`）
  - 账号操作组：退出登录（danger 色，空图标槽位保持文字对齐）
- **路由保留公开可直达**：`/archive` 为公开 SSG 页无需登录；`/favorites` 基于 localStorage，匿名访问有空态提示 + 返回首页链接——两页现有降级逻辑已合理，未改动。
- **横滑兜底评估**：8 项减为 6 项后真 390px 实测内容约 385px 已不溢出；`overflow-x:auto` 机制保留作 ≤375px 窄屏/系统大字体的零成本兜底，右端渐隐 mask 维持移除状态（补记 12）。
- 清理死样式：`.nav .fav-link` 系列（含移动端 media query 内的引用）随 FavLinkWithBadge 一并移除。

**改动文件**：`components/page-shell.tsx`（Header 减项、AuthSlot 菜单加 📥归档/⭐关注 + 分组分隔线、FavLinkWithBadge → FavBadge）、`app/globals.css`（nav-auth-item 改 flex 行、新增 nav-auth-ico/nav-auth-divider、fav-badge 解绑 fav-link、清理死样式）。

**验证**：本地 dev 真 390px（iframe 法）+ 1440px 首页 header 匿名态截图确认单行无溢出；构建通过（/archive、/favorites 保持静态路由）。已知限制：本地无 Supabase env，头像菜单展开态（含新两项 + 徽章 + 分组排版）只能线上真实账号验证。
