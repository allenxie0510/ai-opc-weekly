'use client';

import { useEffect, useState } from 'react';
import { trackProductRadarEvent } from '@/lib/product-radar/client-events';
import { LineIcon } from '@/components/icons';

const KEY = 'aiopc_product_radar_watchlist';

export function WatchlistButton({ slug }: { slug: string }) {
  const [watched, setWatched] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setWatched(JSON.parse(localStorage.getItem(KEY) || '[]').includes(slug)); } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, [slug]);
  const toggle = () => {
    try {
      const items: string[] = JSON.parse(localStorage.getItem(KEY) || '[]');
      const next = items.includes(slug) ? items.filter((item) => item !== slug) : [...items, slug];
      localStorage.setItem(KEY, JSON.stringify(next));
      setWatched(next.includes(slug));
      trackProductRadarEvent('toggle_watchlist', { slug, watched: next.includes(slug) });
    } catch {}
  };
  return <button type="button" className={`pr-watch ${watched ? 'active' : ''}`} onClick={toggle}><LineIcon name="star" fill={watched ? 'currentColor' : 'none'} /> {watched ? '已加入观察' : '加入观察'}</button>;
}
