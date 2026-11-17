import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { AnalyticsTracker } from '@/components/analytics-tracker';
import './globals.css';
import './reading.css';
import '../modules/explore/explore.css';

export const metadata: Metadata = {
  alternates: { types: { 'application/rss+xml': 'https://www.aiopcnews.com/feed.xml' } },
  title: 'AI OPC · AI 一人公司精选资讯',
  description: '面向个人创作者、AI开发者与设计师，精选行业变化、工具能力和经营案例。',
  openGraph: {
    title: 'AI OPC',
    description: '看懂行业、改进工作、做好经营。',
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
              description: '面向 AI 一人公司的精选资讯与周报。',
            }),
          }}
        />
      </head>
      <body>
        <AnalyticsTracker />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
