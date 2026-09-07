'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { onAuthChange } from '@/modules/explore/lib/auth';
import { trackAnalytics } from '@/lib/analytics-client';
export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    let readSeconds = 0;
    let readSent = false;
    void trackAnalytics('visit');
    const slug = pathname.match(/^\/opportunities\/([^/]+)$/)?.[1];
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (slug && !readSent && ++readSeconds >= 10) {
        readSent = true;
        void trackAnalytics('opportunity_read', { objectId: decodeURIComponent(slug) });
      }
    }, 1000);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') void trackAnalytics('visit');
    }, 5 * 60000);
    return () => { clearInterval(timer); clearInterval(heartbeat); };
  }, [pathname]);
  useEffect(() => onAuthChange(session => {
    // Never call getSession synchronously inside a Supabase auth callback.
    if (session && !window.location.pathname.startsWith('/admin')) setTimeout(() => { void trackAnalytics('active'); }, 0);
  }), []);
  return null;
}
