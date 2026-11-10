import 'server-only';
/**
 * จัดการผู้ใช้แอดมิน (admin_listUsers / admin_updateUser / admin_deleteUser เดิม)
 *
 * ต่างจากระบบเดิม: แอดมินไม่ตั้งรหัสผ่านให้คนอื่นอีกต่อไป — ระบบออก "ลิงก์ตั้งรหัสผ่าน (ใช้ครั้งเดียว)"
 * ให้ส่งต่อแทน เจ้าของบัญชีตั้งรหัสเอง ไม่มีใครรู้รหัสของคนอื่น
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AdminAuthError, adminDisplayName } from './auth';
import { canManageUser } from './roles';
import { AdminInputError } from './service';
import type { AdminProfile, AdminRole } from './types';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  active: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  /** ยังไม่เคยตั้งรหัสผ่าน (สร้างจากระบบเดิม / เพิ่งเชิญ) */
  neverSignedIn: boolean;
}

const ROLES: AdminRole[] = ['Developer', 'SuperAdmin', 'Admin2', 'Admin'];
const db = () => getSupabaseAdmin();

function requireManager(actor: AdminProfile) {
  if (actor.role !== 'Developer' && actor.role !== 'SuperAdmin') {
    throw new AdminAuthError(403, 'เฉพาะ SuperAdmin ขึ้นไปที่จัดการผู้ใช้ได้');
  }
}

function parseRole(v: unknown): AdminRole {
  const r = ROLES.find((x) => x.toLowerCase() === String(v ?? '').toLowerCase());
  if (!r) throw new AdminInputError('Role ไม่ถูกต้อง');
  return r;
}

async function audit(actor: AdminProfile, action: string, target: { id: string; email: string }, detail = '') {
  await db().from('audit_log').insert({
    kind: 'audit',
    actor: adminDisplayName(actor),
    action,
    target_id: target.id,
    target_name: target.email,
    field: 'admin_user',
    detail,
  });
}

async function loadAdmin(id: string) {
  const res = await db().from('admins').select('id, email, full_name, role, active, created_at').eq('id', id).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  if (!res.data) throw new AdminInputError('ไม่พบผู้ใช้นี้');
  return res.data as { id: string; email: string; full_name: string; role: AdminRole; active: boolean; created_at: string };
}

/** ลิงก์ตั้งรหัสผ่าน (ใช้ครั้งเดียว) ชี้มาที่เว็บนี้ ไม่ส่งอีเมล */
async function setPasswordLink(email: string, origin: string): Promise<string> {
  const res = await db().auth.admin.generateLink({ type: 'recovery', email });
  if (res.error) throw new Error(`generate link: ${res.error.message}`);
  return `${origin}/admin/reset-password?token_hash=${res.data.properties.hashed_token}&type=recovery`;
}

export async function listUsers(actor: AdminProfile): Promise<AdminUser[]> {
  requireManager(actor);
  const res = await db().from('admins').select('id, email, full_name, role, active, created_at').order('created_at');
  if (res.error) throw new Error(res.error.message);
  const auth = await db().auth.admin.listUsers({ page: 1, perPage: 1000 });
  const signIn = new Map((auth.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
  return (res.data as Array<{ id: string; email: string; full_name: string; role: AdminRole; active: boolean; created_at: string }>).map((a) => ({
    id: a.id,
    email: a.email,
    fullName: a.full_name,
    role: a.role,
    active: a.active,
    createdAt: a.created_at,
    lastSignInAt: signIn.get(a.id) ?? null,
    neverSignedIn: !signIn.get(a.id),
  }));
}

export async function inviteUser(
  actor: AdminProfile,
  input: { email?: unknown; fullName?: unknown; role?: unknown },
  origin: string,
): Promise<{ user: AdminUser; link: string }> {
  requireManager(actor);
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AdminInputError('อีเมลไม่ถูกต้อง');
  const role = parseRole(input.role ?? 'Admin');
  if (!canManageUser(actor.role, role)) throw new AdminAuthError(403, `${actor.role} ตั้ง Role เป็น ${role} ไม่ได้`);
  const fullName = String(input.fullName ?? '').trim().slice(0, 120);

  const existing = await db().from('admins').select('id').eq('email', email).maybeSingle();
  if (existing.data) throw new AdminInputError('อีเมลนี้เป็นผู้ใช้อยู่แล้ว');

  let userId: string | null = null;
  const created = await db().auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) userId = created.data.user.id;
  else {
    // มีบัญชี Auth อยู่แล้ว (เช่น เคยถูกลบสิทธิ์แอดมิน) → ใช้บัญชีเดิม
    const list = await db().auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list.data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (!userId) throw new Error(`create user: ${created.error?.message}`);
  }

  const ins = await db().from('admins').insert({ id: userId, email, full_name: fullName, role, active: true });
  if (ins.error) throw new Error(`insert admin: ${ins.error.message}`);
  await audit(actor, 'เพิ่มผู้ใช้', { id: userId, email }, `role=${role}`);

  const link = await setPasswordLink(email, origin);
  const user = (await listUsers(actor)).find((u) => u.id === userId)!;
  return { user, link };
}

export async function updateUser(
  actor: AdminProfile,
  id: string,
  input: { fullName?: unknown; role?: unknown; active?: unknown },
): Promise<AdminUser> {
  requireManager(actor);
  const target = await loadAdmin(id);
  if (!canManageUser(actor.role, target.role)) throw new AdminAuthError(403, `${actor.role} แก้ไขบัญชี ${target.role} ไม่ได้`);

  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = String(input.fullName ?? '').trim().slice(0, 120);
  if (input.role !== undefined) {
    const role = parseRole(input.role);
    if (role !== target.role) {
      if (id === actor.id) throw new AdminInputError('เปลี่ยน Role ของตัวเองไม่ได้');
      if (!canManageUser(actor.role, role)) throw new AdminAuthError(403, `${actor.role} ตั้ง Role เป็น ${role} ไม่ได้`);
      patch.role = role;
    }
  }
  if (input.active !== undefined) {
    const active = input.active === true;
    if (!active && id === actor.id) throw new AdminInputError('ปิดใช้งานบัญชีตัวเองไม่ได้');
    patch.active = active;
  }
  if (Object.keys(patch).length) {
    const res = await db().from('admins').update(patch).eq('id', id);
    if (res.error) throw new Error(res.error.message);
    await audit(
      actor,
      'แก้ไขผู้ใช้',
      target,
      Object.entries(patch)
        .map(([k, v]) => `${k}=${v}`)
        .join(' | '),
    );
  }
  return (await listUsers(actor)).find((u) => u.id === id)!;
}

export async function newPasswordLink(actor: AdminProfile, id: string, origin: string): Promise<{ link: string }> {
  requireManager(actor);
  const target = await loadAdmin(id);
  if (!canManageUser(actor.role, target.role)) throw new AdminAuthError(403, `${actor.role} จัดการบัญชี ${target.role} ไม่ได้`);
  const link = await setPasswordLink(target.email, origin);
  await audit(actor, 'ออกลิงก์ตั้งรหัสผ่าน', target);
  return { link };
}

/** ลบผู้ใช้ — ลบบัญชี Supabase Auth ด้วย (สิทธิ์ใน admins ถูกลบตาม) */
export async function deleteUser(actor: AdminProfile, id: string): Promise<{ id: string }> {
  requireManager(actor);
  if (id === actor.id) throw new AdminInputError('ลบบัญชีตัวเองไม่ได้');
  const target = await loadAdmin(id);
  if (!canManageUser(actor.role, target.role)) throw new AdminAuthError(403, `${actor.role} ลบบัญชี ${target.role} ไม่ได้`);
  const res = await db().auth.admin.deleteUser(id);
  if (res.error) throw new Error(`delete user: ${res.error.message}`);
  await audit(actor, 'ลบผู้ใช้', target, `role=${target.role}`);
  return { id };
}
