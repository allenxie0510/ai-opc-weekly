import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_SESSION_COOKIE = 'aiopc_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const SESSION_VERSION = 'v1';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string): string | null {
  const password = process.env.ADMIN_PASSWORD;
  return password ? createHmac('sha256', password).update(payload).digest('hex') : null;
}

export function isAdminPassword(value: string | null | undefined): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && !!value && safeEqual(value, expected);
}

export function createAdminSessionValue(now = Date.now()): string | null {
  const payload = `${SESSION_VERSION}.${now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000}`;
  const signature = sign(payload);
  return signature ? `${payload}.${signature}` : null;
}

export function isAdminSessionValue(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [version, expiresAtRaw, signature, ...extra] = value.split('.');
  if (extra.length > 0 || version !== SESSION_VERSION || !expiresAtRaw || !signature) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const expected = sign(`${version}.${expiresAtRaw}`);
  return !!expected && safeEqual(signature, expected);
}

export function requestHasAdminSession(request: Request, now = Date.now()): boolean {
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  if (!cookie) return false;
  try {
    const value = decodeURIComponent(cookie.slice(ADMIN_SESSION_COOKIE.length + 1));
    return isAdminSessionValue(value, now);
  } catch {
    return false;
  }
}

export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  return isAdminSessionValue(store.get(ADMIN_SESSION_COOKIE)?.value);
}
