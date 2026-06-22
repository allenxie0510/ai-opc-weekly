import Link from 'next/link';
import { WeeklyNav } from './weekly-nav';

export function Header() {
  return (
    <header className="border-b border-[var(--color-hairline)] bg-white sticky top-0 z-50">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1 text-lg font-bold" style={{ fontFamily: 'var(--font-brand)', letterSpacing: '0.04em' }}>
          <span className="w-2 h-2 rounded-full bg-[var(--color-blue)] inline-block" />
          AI OPC Weekly
        </Link>
        <nav className="flex items-center gap-3 text-sm text-[var(--color-steel)]">
          <Link href="/archive" className="hover:text-[var(--color-ink)] transition-colors">
            归档
          </Link>
          <Link href="/favorites" className="hover:text-[var(--color-ink)] transition-colors">
            收藏
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PageShell({
  issue,
  issues,
  children,
}: {
  issue: { slug: string; week_number: number; week_start: string; week_end: string };
  issues: { slug: string; week_number: number; week_start: string; week_end: string }[];
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <WeeklyNav currentSlug={issue.slug} issues={issues} />
      <main className="max-w-3xl mx-auto px-4 pb-16">{children}</main>
    </>
  );
}
