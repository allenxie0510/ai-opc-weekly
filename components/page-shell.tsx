import Link from 'next/link';
import { WeeklyNav } from './weekly-nav';

export function Header() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-left">
          <Link href="/" className="brand">AI OPC WEEKLY</Link>
          <div className="nav-links">
            <Link href="/archive">归档</Link>
            <Link href="/favorites" className="fav-link">收藏</Link>
          </div>
        </div>
      </div>
    </nav>
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
      <div className="container">{children}</div>
    </>
  );
}
