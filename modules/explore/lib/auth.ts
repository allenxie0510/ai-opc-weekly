/**
 * 方向探测器 · 浏览器端 Supabase Auth（邮箱/手机号验证码登录）
 * 仅方向探测器使用；新闻浏览不触发登录
 */
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getAuth(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  if (!client) {
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export async function getSession(): Promise<Session | null> {
  const c = getAuth();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session ?? null;
}

export function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}

export async function sendOtp(identifier: string): Promise<{ ok: boolean; error?: string }> {
  const c = getAuth();
  if (!c) return { ok: false, error: 'Supabase 未配置（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）' };
  const { error } = isEmail(identifier)
    ? await c.auth.signInWithOtp({ email: identifier.trim() })
    : await c.auth.signInWithOtp({ phone: identifier.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function verifyOtp(identifier: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const c = getAuth();
  if (!c) return { ok: false, error: 'Supabase 未配置' };
  const { error } = isEmail(identifier)
    ? await c.auth.verifyOtp({ email: identifier.trim(), token: code.trim(), type: 'email' })
    : await c.auth.verifyOtp({ phone: identifier.trim(), token: code.trim(), type: 'sms' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  const c = getAuth();
  if (c) await c.auth.signOut();
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const c = getAuth();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function getToken(): Promise<string | null> {
  const s = await getSession();
  return s?.access_token ?? null;
}
