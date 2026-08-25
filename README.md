This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 小红书选品雷达

新的「工具」产品层提供 `/tools/xhs-product-radar`，完整决策链在无任何外部 API Key 时也可通过 Fixture Data 运行。

```bash
cp .env.example .env.local
npm run dev
npm run test:product-radar
npm run pipeline:product-radar
```

- 工具产品层默认不公开：`TOOLS_ENABLED` 未设为 `true` 时，导航不显示“工具”，`/tools`、选品雷达页面及其 API 均返回 404，站点地图也不收录相关地址。功能代码、Fixture、Provider 和流水线仍完整保留。
- 管理员在 `/admin` 使用 `ADMIN_PASSWORD` 登录后会获得 7 天 HttpOnly 管理会话，可从审核台的“工具预览”或全站导航完整访问隐藏工具；普通用户仍不可见且直达返回 404。退出审核台会立即清除该会话。
- 准备重新上线时设置 `TOOLS_ENABLED=true`；浏览器导航的同步开关为 `NEXT_PUBLIC_TOOLS_ENABLED`。单独关闭选品雷达仍可使用 `XHS_PRODUCT_RADAR_ENABLED=false`。
- `PRODUCT_RADAR_DATA_MODE=fixture` 是安全默认值。`live` 模式只读取 Supabase 中已发布的规范化 payload，查询失败会回退 Fixture。
- 先应用 `supabase/migrations/20260824090000_product_radar.sql`，再使用 `npm run pipeline:product-radar -- --persist` 写入。持久化需要服务端 `SUPABASE_SERVICE_ROLE_KEY`。
- 每日 GitHub Action 在上海时间 07:00 运行。手动触发时可选择是否持久化；默认只进行安全的 Fixture 流水线校验。

所有外部数据都必须通过 `lib/product-radar/providers` 下的 Provider Adapter 归一化。不允许使用小红书登录 Cookie、验证码绕过、反爬规避或未授权抓取。
