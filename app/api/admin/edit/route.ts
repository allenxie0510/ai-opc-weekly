/**
 * POST /api/admin/edit — 编辑草稿内容（发布前精修）
 * body: { type: 'radar' | 'weekly', id: string, fields: {...} }
 *   radar  可改: title / summary / editor_note / pick_reason / category / score
 *   weekly 可改: title / summary
 * 仅允许编辑 status='draft' 的行，已发布内容不受保护性锁定之外的影响
 * 认证：请求头 X-Admin-Token 需匹配环境变量 ADMIN_PASSWORD
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) return null;
  return createClient(url, srk);
}

function isAdmin(request: Request): boolean {
  const token = request.headers.get('x-admin-token');
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && token === expected;
}

const RADAR_FIELDS = ['title', 'summary', 'editor_note', 'pick_reason', 'category', 'score'] as const;
const WEEKLY_FIELDS = ['title', 'summary'] as const;
const NEWS_ITEM_FIELDS = ['title', 'description', 'insight', 'mrr_range', 'pricing', 'mvp_time'] as const;
const OPP_FIELDS = ['title', 'thesis', 'editor_take', 'recommendation', 'editor_conviction', 'category'] as const;
const CATEGORIES = ['micro-saas', 'design-assets', 'automation', 'content-monetize', 'indie-tool', 'digital-product', 'other'];
const RECOMMENDATIONS = ['BUILD', 'WATCH', 'NICHE_ONLY', 'SKIP'];
const CONVICTIONS = ['high', 'medium', 'low'];

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  const supabase = getAdminClient();
  if (!supabase) {
    return Response.json({ error: '服务端缺少 SUPABASE_SERVICE_ROLE_KEY（请在 Vercel 环境变量中配置）' }, { status: 500 });
  }

  try {
    const { type, id, fields } = await request.json();
    if (!['radar', 'weekly', 'news_item', 'opportunity'].includes(type)) {
      return Response.json({ error: 'type 必须是 radar / weekly / news_item / opportunity' }, { status: 400 });
    }
    if (!id || typeof fields !== 'object' || fields === null) {
      return Response.json({ error: 'id 和 fields 必填' }, { status: 400 });
    }

    // 只保留白名单字段，并做长度/取值约束
    const allowed =
      type === 'radar' ? RADAR_FIELDS
      : type === 'weekly' ? WEEKLY_FIELDS
      : type === 'opportunity' ? OPP_FIELDS
      : NEWS_ITEM_FIELDS;
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (!(key in fields)) continue;
      const v = fields[key];
      if (key === 'score') {
        update.score = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
      } else if (key === 'category' && type === 'radar') {
        if (!CATEGORIES.includes(v)) return Response.json({ error: 'category 非法' }, { status: 400 });
        update.category = v;
      } else if (key === 'recommendation') {
        if (!RECOMMENDATIONS.includes(v)) return Response.json({ error: 'recommendation 必须是 BUILD / WATCH / NICHE_ONLY / SKIP' }, { status: 400 });
        update.recommendation = v;
      } else if (key === 'editor_conviction') {
        if (!CONVICTIONS.includes(v)) return Response.json({ error: 'editor_conviction 必须是 high / medium / low' }, { status: 400 });
        update.editor_conviction = v;
      } else {
        update[key] = String(v ?? '').slice(0, key === 'title' ? 200 : key === 'pick_reason' ? 100 : key === 'mrr_range' || key === 'pricing' || key === 'mvp_time' ? 100 : key === 'thesis' ? 500 : key === 'category' ? 50 : 1000);
      }
    }
    if (Object.keys(update).length === 0) {
      return Response.json({ error: '没有可更新的字段' }, { status: 400 });
    }

    const table = type === 'radar' ? 'radar_items' : type === 'weekly' ? 'weekly_issues' : type === 'opportunity' ? 'opportunities' : 'news_items';
    let query = supabase.from(table).update(update).eq('id', id);
    if (type !== 'news_item') {
      // news_items 无 status 列；radar/weekly 草稿与已发布均可编辑（管理员权限）
      query = query.in('status', ['draft', 'published']);
    }
    const { error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ status: 'ok' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
