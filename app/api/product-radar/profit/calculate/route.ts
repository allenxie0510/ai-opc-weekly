import { NextRequest, NextResponse } from 'next/server';
import { isProductRadarEnabled } from '@/lib/product-radar/config';
import { calculateProfit } from '@/lib/product-radar/profit';

const counters = new Map<string, { count: number; expiresAt: number }>();

function limited(request: NextRequest): boolean {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const now = Date.now();
  const record = counters.get(key);
  if (!record || record.expiresAt < now) { counters.set(key, { count: 1, expiresAt: now + 60_000 }); return false; }
  record.count += 1;
  return record.count > 60;
}

export async function POST(request: NextRequest) {
  if (!isProductRadarEnabled()) return NextResponse.json({ error: 'Product radar is disabled' }, { status: 404 });
  if (limited(request)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body');
    return NextResponse.json(calculateProfit(body));
  } catch {
    return NextResponse.json({ error: 'Invalid profit input' }, { status: 400 });
  }
}
