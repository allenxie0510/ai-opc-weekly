'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface NavIssue {
  slug: string;
  week_number: number;
  week_start: string;
  week_end: string;
}

export function WeeklyNav({
  currentSlug,
  issues,
}: {
  currentSlug: string;
  issues: NavIssue[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentIdx = issues.findIndex(i => i.slug === currentSlug);
  const current = issues[currentIdx];
  const newer = currentIdx > 0 ? issues[currentIdx - 1] : null;
  const older = currentIdx < issues.length - 1 ? issues[currentIdx + 1] : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const fmt = (i: NavIssue) => {
    const s = new Date(i.week_start);
    const e = new Date(i.week_end);
    return `W${i.week_number} · ${s.getMonth()+1}/${s.getDate()}–${e.getMonth()+1}/${e.getDate()}`;
  };

  return (
    <div className="border-b border-[var(--color-hairline)] bg-white">
      <div className="container flex items-center justify-center gap-1 py-3">
        {/* Prev */}
        {newer ? (
          <Link href={`/weekly/${newer.slug}`} title={fmt(newer)} className="text-[var(--color-steel)] hover:text-[var(--color-ink)] px-2">‹</Link>
        ) : (
          <span className="px-2 text-[var(--color-hairline)]">‹</span>
        )}

        {/* Week picker */}
        <div ref={ref} className={`week-picker${open ? ' open' : ''}`}>
          <button onClick={() => setOpen(!open)} className="week-picker-btn">
            {current ? fmt(current) : '...'}
            <span className="picker-arrow">▾</span>
          </button>

          <div className="week-picker-menu">
            {issues.map((i) => (
              <Link
                key={i.slug}
                href={`/weekly/${i.slug}`}
                onClick={() => setOpen(false)}
                className={i.slug === currentSlug ? 'active' : ''}
              >
                {fmt(i)}
              </Link>
            ))}
            <div className="menu-divider" />
            <Link href="/archive" onClick={() => setOpen(false)}>全部归档 →</Link>
          </div>
        </div>

        {/* Next */}
        {older ? (
          <Link href={`/weekly/${older.slug}`} title={fmt(older)} className="text-[var(--color-steel)] hover:text-[var(--color-ink)] px-2">›</Link>
        ) : (
          <span className="px-2 text-[var(--color-hairline)]">›</span>
        )}
      </div>
    </div>
  );
}
