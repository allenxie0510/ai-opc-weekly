import { NextResponse } from 'next/server';
import { isProductRadarEnabled, PRODUCT_RADAR_CACHE_SECONDS } from '@/lib/product-radar/config';
import { requestCanAccessProductRadar } from '@/lib/product-radar/access';
import { getProductRadarRepository } from '@/lib/product-radar/repository';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!requestCanAccessProductRadar(request)) return NextResponse.json({ error: 'Product radar is disabled' }, { status: 404 });
  const { slug } = await params;
  const item = await getProductRadarRepository().getBySlug(slug);
  if (!item) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  const cacheControl = isProductRadarEnabled()
    ? `public, s-maxage=${PRODUCT_RADAR_CACHE_SECONDS}, stale-while-revalidate=600`
    : 'private, no-store';
  return NextResponse.json(item, { headers: { 'Cache-Control': cacheControl } });
}
