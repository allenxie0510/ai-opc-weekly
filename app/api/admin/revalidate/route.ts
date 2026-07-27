/**
 * POST /api/admin/revalidate — 按需刷新 ISR 缓存
 * 管理员编辑/下架/发布内容后调用，立即清除全站静态页面缓存，
 * 使前台下一次加载即显示最新数据（不必等 5 分钟 revalidate 周期）
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 */
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(request: Request): boolean {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && token === expected;
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  // 以根布局为单位整体失效：站点体量小，一次全刷最简单可靠
  revalidatePath('/', 'layout');
  return Response.json({ status: 'ok', revalidated: true });
}
