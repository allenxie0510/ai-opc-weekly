import { NextResponse } from 'next/server';
import { isProductRadarEnabled, PRODUCT_RADAR_CACHE_SECONDS } from '@/lib/product-radar/config';
import { getProductRadarRepository } from '@/lib/product-radar/repository';

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isProductRadarEnabled()) return NextResponse.json({ error: 'Product radar is disabled' }, { status: 404 });
  const { slug } = await params;
  const item = await getProductRadarRepository().getBySlug(slug);
  if (!item) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  return NextResponse.json(item, { headers: { 'Cache-Control': `public, s-maxage=${PRODUCT_RADAR_CACHE_SECONDS}, stale-while-revalidate=600` } });
}
