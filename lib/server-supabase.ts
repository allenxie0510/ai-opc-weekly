import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Server-only, lazy Supabase factory. It never throws while a route module is being built. */
export function createServerSupabase(preferServiceRole = false): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = preferServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}
