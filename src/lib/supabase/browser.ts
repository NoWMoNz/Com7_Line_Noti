'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Supabase client ฝั่ง browser — ใช้สำหรับ login / ออกจากระบบ / ตั้งรหัสผ่านของแอดมินเท่านั้น
 * session เก็บใน cookie ให้ API ฝั่ง server อ่านได้
 * อ่านข้อมูลตารางด้วย client นี้ไม่ได้ (RLS ปิดทุกตาราง) — ข้อมูลทั้งหมดผ่าน /api/admin/*
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    );
  }
  return client;
}
