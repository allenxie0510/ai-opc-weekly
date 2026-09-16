# AI OPC 编辑视觉规范 · 2026-09-16

本轮聚焦呈现，不更改选题、评分、数据库或发布状态。沿用品牌橙、深墨色与原有字体；周报深度研究继续遵循 WEEKLY-EDITORIAL-STANDARD.md 的纸色、衬线标题和蓝色证据标注。

## 列表与阅读

- 手机 ≤768px：机会列表采用约104×88缩略图、完整标题、研究建议/分类和来源日期。无封面或加载失败时退化为纯文字，不生成占位插画。客户、验证计划等完整信息在机会详情页。
- 每日信号使用约96×80缩略图；无图直接显示标题、来源和关键标签。解读、完整摘要与证据通过原生 details 展开，可键盘操作。
- 周报条目没有图片字段，采用文字列表；摘要默认两行，展开详情后显示完整摘要、数据、来源和经营证据。收藏及研究报告入口保留。
- 桌面机会库保留三列，平板中等宽度两列；手机改为分隔线列表。首页仅头条保留大图，次要机会使用紧凑列表。
- 分类头部均为平直矩形，紧贴导航且横向铺满视口；桌面高度336px起，手机224px起（周报250px起），长标题自然增高。正文保持1280px最大宽度，头图文字与正文网格对齐。栏目插画是识别性装饰，不表示具体产品事实。
- 研究报告头图标注“栏目插画”，保留原报告目录、事实引用、验证计划、收藏、分享和打印；打印隐藏装饰图。
- 顶部与footer logo保持上次80%缩放结果；深色浏览器偏好仍切换深色版logo与导航。

## 图像资产

使用内置 imagegen 生成，未调用生产封面管线，也未调用外部 CLI 模型。原始PNG保存在 Codex generated_images 中；站点使用1200px宽 WebP，quality82，总计约216KB。压缩只改变尺寸与编码。

共用提示词：

> Create one panoramic editorial website category illustration, landscape 3:2 composition suitable for cropping to wide 3:1. Flat conceptual shapes, visible fine grainy stipple, matte printed paper, sophisticated independent business magazine. Solid monochrome background, generous negative space, a single conceptual focal group centered toward the right, no text, letters, logos, watermarks, borders or diagonal bottom edge. Restrained orange, ink black and off-white plus one accent.

每张追加提示词：

| 文件（public/editorial） | 追加场景 |
|---|---|
| opportunities.webp | OPPORTUNITIES: a large warm orange geometric doorway opens onto a small pale blue rising staircase, an off-white sphere at its threshold, suggesting discovering an achievable business opening. Warm ivory background. Bold sculptural geometry, subtle gradients only within objects. |
| radar.webp | DAILY SIGNALS: a sculptural off-white radar dish receives three small orange spheres along delicate concentric circular arcs, a small ink-black base. Pale desaturated blue solid background. Intelligent calm composition, no decorative interface or text. |
| weekly.webp | WEEKLY RESEARCH: an open off-white book becomes a precise miniature architectural staircase, a large orange circular lens hovers above it revealing one ink-black geometric gem. Solid muted warm peach background, pale blue accent, editorial metaphor of reading deeply and finding enduring value. |
| explore.webp | DIRECTION EXPLORER: a bold orange compass needle balances over a folded off-white map with three simple ink-black routes and a single blue destination sphere. Solid pale sage background. Restrained sculptural editorial still life, no text or map labels. |
| voices.webp | FOUNDER VOICES: three sculptural off-white conversation bubbles connected by one fine ink-black flowing line, one orange sphere emerging from the central bubble as an idea. Flat pale lavender solid background. Minimal sophisticated magazine illustration, no social network logos or text. |

## 审核方法

本地没有生产数据库配置。列表测试使用只读提取的公开标题与封面，评分、日期等辅助字段为测试值；报告使用仓库原有的合成测试样本。测试路由与数据不进入正式提交，不写入数据库。

检查320/390/768/1280px视口、搜索与重置、周报收藏与展开、雷达展开、无图与404图片降级、深色导航。正式空数据页单独检查。截图仅说明布局，不是上线内容或选题质量证明。


## 2026-09-16 头图与周报精简修订

- 栏目头图从正文容器移出，导航与头图间无外边距，删除橙色底线和渐变遮罩。
- 从原插画左边缘在sRGB空间采样背景色，使用低透明度细颗粒纹理填充全宽背景。复用原插画，不裁改原始资产。超宽屏背景延伸，主体仍保持比例。
- 文字采用对比度清晰的深墨色；`CategoryHero` 的 `tone="dark"` 支持深背景上的白色标题与导读。当前五张背景均为浅色，继续使用深色文字。
- 周报顺序：导航→头图→周切换→默认收起的分类筛选→文章。收起状态仍显示选中的类别；按钮保留aria-pressed。删除分享本期/下载HTML入口与分区标题旁的重复说明。
- 本轮审核覆盖320/390/768/1440/1920px头图宽度、导航衔接、横向溢出、筛选展开/收起/重置与周切换下拉。
