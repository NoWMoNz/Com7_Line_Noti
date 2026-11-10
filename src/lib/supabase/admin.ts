import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

let client: SupabaseClient | null = null;

/** Supabase client สิทธิ์เต็ม (bypass RLS) — ใช้ได้เฉพาะโค้ดฝั่ง server เท่านั้น */
export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(serverEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
