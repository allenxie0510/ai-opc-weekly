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
