/**
 * 方向探测器 · 浏览器端 Supabase Auth（邮箱一次性验证码登录）
 * 仅方向探测器使用；新闻浏览不触发登录
 */
import { createClient, type AuthError, type SupabaseClient, type Session } from '@supabase/supabase-js';

export type AuthActionResult = {
  ok: boolean;
  error?: string;
  code?: string;
  status?: number;
};

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

function authErrorResult(error: AuthError): AuthActionResult {
  return {
    ok: false,
    error: error.message,
    code: error.code,
    status: error.status,
  };
}

export async function sendEmailOtp(email: string): Promise<AuthActionResult> {
  const c = getAuth();
  if (!c) return { ok: false, error: 'Supabase 未配置（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）' };
  // 邮件类型由 Supabase 模板决定：Confirm signup 与 Magic Link 模板均必须
  // 使用 {{ .Token }}，不能再使用 {{ .ConfirmationURL }}。
  const { error } = await c.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
    },
  });
  return error ? authErrorResult(error) : { ok: true };
}

export async function verifyEmailOtp(email: string, token: string): Promise<AuthActionResult> {
  const c = getAuth();
  if (!c) return { ok: false, error: 'Supabase 未配置（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）' };
  const { error } = await c.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  return error ? authErrorResult(error) : { ok: true };
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
