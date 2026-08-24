'use client';
import { useEffect } from 'react';
import { trackProductRadarEvent } from '@/lib/product-radar/client-events';
export function OpportunityViewEvent({ slug }: { slug: string }) {
  useEffect(() => { trackProductRadarEvent('view_opportunity', { slug }); }, [slug]);
  return null;
}
