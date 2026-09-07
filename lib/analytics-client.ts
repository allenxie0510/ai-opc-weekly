'use client';
import { getToken } from '@/modules/explore/lib/auth';
let queue = Promise.resolve();
export function trackAnalytics(kind: 'visit' | 'opportunity_read' | 'active' | 'research_completed', extra: { objectId?: string; source?: string } = {}) {
  if (typeof window === 'undefined' || navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return Promise.resolve();
  const send = async () => {
    try {
      const token = await getToken();
      await fetch('/api/analytics/events', {
        method: 'POST', credentials: 'same-origin', keepalive: true, signal: AbortSignal.timeout(3000),
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ kind, ...extra }),
      });
    } catch { /* Analytics must never prevent reading, login, generation or saving. */ }
  };
  queue = queue.then(send, send);
  return queue;
}
