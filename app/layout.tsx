import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI OPC Weekly · 独立创作者复利创业方向',
  description: '一人公司 · 独立设计师/开发者 · 可落地的 AI 微创业。每周精选 12 条 AI 创业机会。',
  openGraph: {
    title: 'AI OPC Weekly',
    description: '一人公司 · 独立设计师/开发者 · 可落地的 AI 微创业',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Bebas+Neue&display=swap" rel="stylesheet" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'AI OPC Weekly',
              url: 'https://www.aiopcnews.com',
              description: '一人公司 · 独立设计师/开发者 · 可落地的 AI 微创业周报。每周精选 12 条 AI 创业机会。',
              sameAs: ['https://github.com/allenxie0510/ai-opc-weekly'],
            }),
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
