/**
 * 方向探测器 · 服务端鉴权助手（仅服务端使用，勿在前端引入）
 * 用 SERVICE_ROLE 校验客户端传来的 Supabase access_token，得到 user id
 */
import { createClient } from '@supabase/supabase-js';

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) return null;
  return createClient(url, srk);
}

export type AuthResult = { userId: string } | { error: string; status: number };

export async function requireUser(request: Request): Promise<AuthResult> {
  const supabase = getAdminClient();
  if (!supabase) return { error: '服务端未配置 Supabase（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）', status: 503 };
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return { error: '未登录', status: 401 };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { error: '登录已失效，请重新登录', status: 401 };
  return { userId: data.user.id };
}
