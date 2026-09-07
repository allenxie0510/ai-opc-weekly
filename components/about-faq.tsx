'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native details keeps keyboard interaction and no-JS expansion working. */
export function AboutFaq({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function revealAnchor(hash = window.location.hash) {
      const target = document.getElementById(hash.slice(1));
      if (!(target instanceof HTMLDetailsElement) || !root.current?.contains(target)) return;
      target.open = true;
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    function onHashChange() { revealAnchor(); }
    function onLinkClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank') return;
      const url = new URL(link.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.hash) revealAnchor(url.hash);
    }
    revealAnchor();
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('click', onLinkClick, true);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('click', onLinkClick, true);
    };
  }, []);
  return <div className="about-faq" ref={root}>{children}</div>;
}

export function FaqItem({ id, title, children, defaultOpen = false }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean }) {
  return <details className="faq-item" id={id} open={defaultOpen}>
    <summary><h3>{title}</h3><svg className="faq-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></summary>
    <div className="faq-answer">{children}</div>
  </details>;
}
