import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';

/**
 * Supabase client ที่อ่าน session ของแอดมินจาก cookie (ต้องสร้างใหม่ทุก request)
 * ใช้ตรวจตัวตนเท่านั้น — อ่าน/เขียนข้อมูลใช้ getSupabaseAdmin() หลังตรวจสิทธิ์แล้ว
 */
export async function createSupabaseAuthClient() {
  const store = await cookies();
  return createServerClient(serverEnv.supabaseUrl(), serverEnv.supabasePublishableKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        // ต่ออายุ token แล้วเขียน cookie กลับ — Route Handler เขียนได้, Server Component เขียนไม่ได้ (ข้าม)
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* อ่านอย่างเดียว */
        }
      },
    },
  });
}
