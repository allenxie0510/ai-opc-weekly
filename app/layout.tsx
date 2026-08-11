import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI OPC · 一人公司创业机会情报',
  description: 'AI × 一人公司创业机会情报系统：机会判断（OPC Score + 证据链 + 验证计划）+ 每日信号雷达 + 每周精选。',
  openGraph: {
    title: 'AI OPC',
    description: 'AI × 一人公司创业机会情报：不只是信息，更是可执行的判断',
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
              name: 'AI OPC',
              url: 'https://www.aiopcnews.com',
              description: 'AI × 一人公司创业机会情报系统：机会判断 + 每日信号雷达 + 每周精选。',
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
