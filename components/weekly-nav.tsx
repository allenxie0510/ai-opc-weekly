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
    <div className="border-b border-[var(--color-hairline)] bg-white sticky top-14 z-40">
      <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-center gap-1">
        {/* Prev */}
        {newer ? (
          <Link
            href={`/weekly/${newer.slug}`}
            className="w-10 h-8 flex items-center justify-center rounded-md hover:bg-[var(--color-surface)] transition-colors text-[var(--color-steel)]"
            title={fmt(newer)}
          >
            ‹
          </Link>
        ) : (
          <span className="w-10 h-8 flex items-center justify-center text-[var(--color-hairline)]">‹</span>
        )}

        {/* Current trigger */}
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="px-3 py-1.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface)] rounded-md transition-colors flex items-center gap-1"
          >
            {current ? fmt(current) : '...'}
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          {open && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-white border border-[var(--color-hairline)] rounded-xl shadow-lg min-w-[200px] py-1.5 z-50">
              {issues.map((i) => (
                <Link
                  key={i.slug}
                  href={`/weekly/${i.slug}`}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2 text-sm hover:bg-[var(--color-surface)] transition-colors ${
                    i.slug === currentSlug
                      ? 'text-[var(--color-coral)] font-semibold'
                      : 'text-[var(--color-charcoal)]'
                  }`}
                >
                  {i.slug === currentSlug ? '● ' : ''}{fmt(i)}
                  {i.slug === issues[0].slug && (
                    <span className="ml-1.5 text-[10px] text-[var(--color-coral)] font-medium">最新</span>
                  )}
                </Link>
              ))}
              <div className="border-t border-[var(--color-hairline)] my-1" />
              <Link
                href="/archive"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-[var(--color-steel)] hover:bg-[var(--color-surface)] transition-colors"
              >
                全部归档 →
              </Link>
            </div>
          )}
        </div>

        {/* Next */}
        {older ? (
          <Link
            href={`/weekly/${older.slug}`}
            className="w-10 h-8 flex items-center justify-center rounded-md hover:bg-[var(--color-surface)] transition-colors text-[var(--color-steel)]"
            title={fmt(older)}
          >
            ›
          </Link>
        ) : (
          <span className="w-10 h-8 flex items-center justify-center text-[var(--color-hairline)]">›</span>
        )}
      </div>
    </div>
  );
}
