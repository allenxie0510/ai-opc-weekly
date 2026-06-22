import type { Metadata } from 'next';
import { DM_Sans, Bebas_Neue } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-brand',
});

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
    <html lang="zh-CN" className={`${dmSans.variable} ${bebasNeue.variable}`}>
      <body>{children}</body>
    </html>
  );
}
