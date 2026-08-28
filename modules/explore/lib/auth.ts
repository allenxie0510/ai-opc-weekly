/**
 * 方向探测器 · 浏览器端 Supabase Auth（邮箱魔法链接登录）
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

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const c = getAuth();
  if (!c) return { ok: false, error: 'Supabase 未配置（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）' };
  // Supabase signInWithOtp 在邮件模板包含 ConfirmationURL 时发送魔法链接。
  const { error } = await c.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/explore` : undefined,
    },
  });
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
