import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseAuthClient } from '@/lib/supabase/server-auth';
import type { AdminProfile, AdminRole } from './types';

export class AdminAuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/**
 * แอดมินที่ login อยู่ — ตรวจ JWT ใน cookie แล้วต้องมีแถวใน admins ที่ยังใช้งานอยู่
 * (บัญชี Supabase Auth อย่างเดียวไม่พอ ต้องถูกเพิ่มเป็นแอดมินด้วย)
 */
export async function requireAdmin(): Promise<AdminProfile> {
  const auth = await createSupabaseAuthClient();
  const { data, error } = await auth.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) throw new AdminAuthError(401, 'กรุณาเข้าสู่ระบบ');

  const res = await getSupabaseAdmin()
    .from('admins')
    .select('id, email, full_name, role, active')
    .eq('id', userId)
    .maybeSingle();
  if (res.error) throw new Error(`load admin: ${res.error.message}`);
  const row = res.data as { id: string; email: string; full_name: string; role: AdminRole; active: boolean } | null;
  if (!row || !row.active) throw new AdminAuthError(403, 'บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบแอดมิน');

  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

export const adminDisplayName = (a: AdminProfile) => a.fullName || a.email;
