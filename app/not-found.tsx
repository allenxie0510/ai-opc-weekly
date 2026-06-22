import Link from 'next/link';
import { Header } from '@/components/page-shell';

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-brand)', letterSpacing: '0.04em' }}>
          404 · 未找到
        </h1>
        <p className="text-[var(--color-steel)] mb-6">该期周报不存在或尚未发布。</p>
        <Link href="/" className="text-sm text-[var(--color-blue)] hover:underline">返回首页</Link>
      </main>
    </>
  );
}
