import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionValue,
  isAdminPassword,
  requestHasAdminSession,
} from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function GET(request: NextRequest) {
  return noStore(NextResponse.json({ authenticated: requestHasAdminSession(request) }));
}

export async function POST(request: NextRequest) {
  if (!isAdminPassword(request.headers.get('x-admin-token'))) {
    return noStore(NextResponse.json({ authenticated: false }, { status: 401 }));
  }
  const value = createAdminSessionValue();
  if (!value) return noStore(NextResponse.json({ error: 'Admin session is not configured' }, { status: 503 }));

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return noStore(response);
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({ name: ADMIN_SESSION_COOKIE, value: '', path: '/', maxAge: 0 });
  return noStore(response);
}
