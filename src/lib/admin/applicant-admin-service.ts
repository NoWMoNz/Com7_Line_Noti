import 'server-only';
/**
 * แอดมินเพิ่ม / แก้ / ลบผู้สมัคร (admin_addApplicant / admin_updateApplicant / admin_deleteApplicant เดิม)
 */
import { DOCS_BUCKET } from '@/lib/repo/supabase';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { adminDisplayName } from './auth';
import { bangkokLocalToIso } from './dates';
import { findBranch } from './onboarding';
import { AdminInputError, getApplicantDetail } from './service';
import type { AdminProfile, ApplicantDetail, ApplicantInfoInput } from './types';

const db = () => getSupabaseAdmin();

function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const text = (v: unknown, max: number, label: string) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new AdminInputError(`${label}ยาวเกินไป`);
  return s;
};

async function branchesIndex() {
  const rows = ok(await db().from('branches').select('id, label, company, shop_name'), 'branches') as Array<{
    id: number;
    label: string;
    company: string | null;
    shop_name: string;
  }>;
  return rows.map((b) => ({ id: b.id, label: b.label, company: b.company ?? '', shopName: b.shop_name }));
}

/** แปลงฟอร์ม → คอลัมน์ (เฉพาะช่องที่ส่งมา) พร้อมตรวจค่า */
async function toColumns(input: ApplicantInfoInput, selfId: string | null): Promise<Record<string, unknown>> {
  const c: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = text(input.name, 120, 'ชื่อ').replace(/\s+/g, ' ');
    if (!name) throw new AdminInputError('กรุณากรอกชื่อ-นามสกุล');
    c.name = name;
  }
  if (input.phone !== undefined) {
    const phone = String(input.phone ?? '').replace(/\D/g, '');
    if (phone) {
      if (!/^0\d{9}$/.test(phone)) throw new AdminInputError('เบอร์โทรต้องเป็น 10 หลัก ขึ้นต้นด้วย 0');
      let dup = db().from('applicants').select('code, name').eq('phone', phone);
      if (selfId) dup = dup.neq('id', selfId);
      const found = ok(await dup.limit(1), 'phone dup') as Array<{ code: string; name: string }>;
      if (found.length) throw new AdminInputError(`เบอร์โทรนี้มีในระบบแล้ว (${found[0].name || found[0].code})`);
    }
    c.phone = phone || null;
  }
  if (input.branch !== undefined) {
    const label = text(input.branch, 200, 'สาขา');
    c.branch_label = label || null;
    c.branch_id = label ? findBranch(label, await branchesIndex())?.id ?? null : null;
  }
  if (input.notes !== undefined) c.notes = text(input.notes, 2000, 'หมายเหตุ');
  if (input.ta !== undefined) c.ta = text(input.ta, 120, 'TA') || null;
  if (input.intern !== undefined) c.intern = text(input.intern, 120, 'Intern') || null;
  if (input.company !== undefined) c.company = text(input.company, 60, 'บริษัท') || null;
  if (input.position !== undefined) c.position = text(input.position, 120, 'ตำแหน่ง') || null;
  if (input.startDate !== undefined) {
    const d = String(input.startDate ?? '').trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new AdminInputError('วันที่เริ่มงานไม่ถูกต้อง');
    c.start_date = d || null;
  }
  if (input.deadline !== undefined) {
    const iso = bangkokLocalToIso(input.deadline);
    if (iso === undefined) throw new AdminInputError('รูปแบบวันกำหนดส่งไม่ถูกต้อง');
    c.deadline = iso;
  }
  return c;
}

async function audit(admin: AdminProfile, action: string, code: string, name: string, detail: string) {
  await db().from('audit_log').insert({ kind: 'audit', actor: adminDisplayName(admin), action, target_id: code, target_name: name, field: 'applicant', detail });
}

/** HR เพิ่มผู้สมัครเอง — อนุมัติให้ทันทีเหมือนระบบเดิม ผู้สมัครผูก LINE ภายหลังด้วยเบอร์โทรนี้ */
export async function createApplicantByAdmin(admin: AdminProfile, input: ApplicantInfoInput): Promise<ApplicantDetail> {
  if (!input.name?.trim()) throw new AdminInputError('กรุณากรอกชื่อ-นามสกุล');
  const cols = await toColumns(input, null);
  const row = ok(await db().from('applicants').insert({ ...cols, approved: true }).select('id, code, name').single(), 'create') as {
    id: string;
    code: string;
    name: string;
  };
  await audit(admin, 'เพิ่มผู้สมัคร', row.code, row.name, `phone=${cols.phone ?? ''} | branch=${cols.branch_label ?? ''}`);
  return getApplicantDetail(row.id);
}

export async function updateApplicantByAdmin(admin: AdminProfile, id: string, input: ApplicantInfoInput): Promise<ApplicantDetail> {
  const before = ok(await db().from('applicants').select('*').eq('id', id).maybeSingle(), 'load') as Record<string, unknown> | null;
  if (!before) throw new AdminInputError('ไม่พบผู้สมัคร');
  const cols = await toColumns(input, id);
  const changed = Object.entries(cols).filter(([k, v]) => String(before[k] ?? '') !== String(v ?? ''));
  if (changed.length) {
    ok(await db().from('applicants').update(Object.fromEntries(changed)).eq('id', id), 'update');
    await audit(
      admin,
      'แก้ไขข้อมูลผู้สมัคร',
      String(before.code),
      String(before.name ?? ''),
      changed.map(([k, v]) => `${k}: ${before[k] ?? ''} → ${v ?? ''}`).join(' | '),
    );
  }
  return getApplicantDetail(id);
}

/**
 * ลบผู้สมัครถาวร: ไฟล์ใน Storage + ข้อมูลทุกตาราง (ไฟล์/ผลตรวจลบตาม FK)
 * ใช้เมื่อผู้สมัครขอลบข้อมูลตาม PDPA หรือบันทึกผิด — log การแจ้งเตือนเก็บไว้แต่ไม่อ้างถึงคนนี้แล้ว
 */
export async function deleteApplicantByAdmin(admin: AdminProfile, id: string): Promise<{ id: string; filesRemoved: number }> {
  const row = ok(await db().from('applicants').select('id, code, name, phone').eq('id', id).maybeSingle(), 'load') as {
    id: string;
    code: string;
    name: string;
    phone: string | null;
  } | null;
  if (!row) throw new AdminInputError('ไม่พบผู้สมัคร');

  const files = ok(await db().from('applicant_files').select('storage_path').eq('applicant_id', id), 'files') as Array<{
    storage_path: string | null;
  }>;
  const paths = files.map((f) => f.storage_path).filter((p): p is string => !!p);
  for (let i = 0; i < paths.length; i += 100) {
    const res = await db().storage.from(DOCS_BUCKET).remove(paths.slice(i, i + 100));
    if (res.error) throw new Error(`ลบไฟล์ไม่สำเร็จ: ${res.error.message}`);
  }
  ok(await db().from('applicants').delete().eq('id', id), 'delete');
  // ไม่ใส่เบอร์/ชื่อเต็มใน detail — เหลือแค่ร่องรอยว่ามีการลบ
  await audit(admin, 'ลบผู้สมัคร', row.code, row.name, `ลบไฟล์ ${paths.length} ไฟล์`);
  return { id, filesRemoved: paths.length };
}
