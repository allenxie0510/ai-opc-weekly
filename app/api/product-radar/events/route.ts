import { NextRequest, NextResponse } from 'next/server';
import { isProductRadarEnabled } from '@/lib/product-radar/config';

const allowed = new Set(['view_radar_feed', 'filter_radar', 'view_opportunity', 'toggle_watchlist', 'change_profit_input', 'open_supply_offer']);
const recent = new Map<string, { count: number; expiresAt: number }>();

export async function POST(request: NextRequest) {
  if (!isProductRadarEnabled()) return NextResponse.json({ error: 'Product radar is disabled' }, { status: 404 });
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const now = Date.now();
  const state = recent.get(key);
  if (state && state.expiresAt > now && state.count >= 120) return new NextResponse(null, { status: 429 });
  recent.set(key, state && state.expiresAt > now ? { ...state, count: state.count + 1 } : { count: 1, expiresAt: now + 60_000 });
  try {
    const body = await request.json();
    if (!body || !allowed.has(body.name) || typeof body.properties !== 'object') return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    const safeProperties = Object.fromEntries(Object.entries(body.properties).slice(0, 12).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)));
    console.info('[product-radar-event]', JSON.stringify({ name: body.name, properties: safeProperties, occurredAt: body.occurredAt }));
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }
}
