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

### 补记 6（2026-05-11，属封面管线 / 二）：封面风格统一为「编辑插画 · 概念隐喻风」，PHOTO 路线下线

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
