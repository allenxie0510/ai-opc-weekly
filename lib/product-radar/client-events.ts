'use client';

const ALLOWED_EVENTS = new Set(['view_radar_feed', 'filter_radar', 'view_opportunity', 'toggle_watchlist', 'change_profit_input', 'open_supply_offer']);

export function trackProductRadarEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  if (typeof window === 'undefined' || !ALLOWED_EVENTS.has(name)) return;
  const payload = { name, properties, occurredAt: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent('product-radar-event', { detail: payload }));
  void fetch('/api/product-radar/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}
