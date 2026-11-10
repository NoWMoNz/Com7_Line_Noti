/**
 * สร้าง/เปิดใช้บัญชีแอดมิน แล้วพิมพ์ลิงก์ตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว หมดอายุตามที่ตั้งใน Supabase Auth ปกติ 1 ชม.)
 *
 *   npm run create-admin -- <email> [role] [ชื่อที่แสดง]
 *   role: Developer | SuperAdmin | Admin2 | Admin (ค่าเริ่มต้น Admin)
 *
 * ไม่ส่งอีเมล — ให้ส่งลิงก์ที่พิมพ์ออกมาให้เจ้าของบัญชีเอง
 * URL ของลิงก์ใช้ ADMIN_BASE_URL (ถ้าไม่ตั้ง ใช้ http://localhost:3000)
 */
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ROLES = ['Developer', 'SuperAdmin', 'Admin2', 'Admin'] as const;

async function main() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const [email, roleArg = 'Admin', ...nameParts] = process.argv.slice(2);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('ใช้: npm run create-admin -- <email> [role] [ชื่อที่แสดง]');
    process.exit(1);
  }
  const role = ROLES.find((r) => r.toLowerCase() === roleArg.toLowerCase());
  if (!role) {
    console.error(`role ต้องเป็น ${ROLES.join(' | ')}`);
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('ยังไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY ใน .env.local');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const normalized = email.trim().toLowerCase();

  // 1) บัญชี Supabase Auth
  let userId: string | null = null;
  const created = await db.auth.admin.createUser({ email: normalized, email_confirm: true });
  if (created.data.user) {
    userId = created.data.user.id;
    console.log('สร้างบัญชี Auth ใหม่');
  } else {
    // มีอยู่แล้ว → หาจากรายชื่อ
    for (let page = 1; !userId && page <= 50; page++) {
      const list = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (list.error) throw list.error;
      userId = list.data.users.find((u) => u.email?.toLowerCase() === normalized)?.id ?? null;
      if (list.data.users.length < 200) break;
    }
    if (!userId) throw created.error ?? new Error('สร้างบัญชีไม่สำเร็จ');
    console.log('พบบัญชี Auth เดิม');
  }

  // 2) สิทธิ์แอดมิน
  const fullName = nameParts.join(' ').trim();
  const up = await db
    .from('admins')
    .upsert({ id: userId, email: normalized, role, active: true, ...(fullName ? { full_name: fullName } : {}) })
    .select('email, role, active')
    .single();
  if (up.error) throw up.error;
  console.log('สิทธิ์แอดมิน:', up.data);

  // 3) ลิงก์ตั้งรหัสผ่าน (ไม่ส่งอีเมล)
  const link = await db.auth.admin.generateLink({ type: 'recovery', email: normalized });
  if (link.error) throw link.error;
  const base = (process.env.ADMIN_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const hashed = link.data.properties.hashed_token;
  console.log('\nลิงก์ตั้งรหัสผ่าน (ใช้ได้ครั้งเดียว ห้ามส่งต่อ):');
  console.log(`${base}/admin/reset-password?token_hash=${hashed}&type=recovery\n`);
}

main().catch((err) => {
  console.error('ล้มเหลว:', err?.message ?? err);
  process.exit(1);
});
