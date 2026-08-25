import { hasAdminSession, requestHasAdminSession } from '@/lib/admin-session';
import { isProductRadarEnabled, isToolsEnabled } from './config';

export async function canAccessTools(): Promise<boolean> {
  return isToolsEnabled() || hasAdminSession();
}

export async function canAccessProductRadar(): Promise<boolean> {
  return isProductRadarEnabled() || hasAdminSession();
}

export function requestCanAccessProductRadar(request: Request): boolean {
  return isProductRadarEnabled() || requestHasAdminSession(request);
}
