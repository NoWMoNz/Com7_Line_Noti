import 'server-only';
/** สาขา (admin_getBranchesFull / admin_addBranchInfo / admin_updateBranchInfo / admin_deleteBranchInfo เดิม) */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { adminDisplayName } from './auth';
import { AdminInputError } from './service';
import type { AdminProfile } from './types';

export interface Branch {
  id: number;
  shopCode: string;
  shopName: string;
  company: string;
  mainUnit: string;
  rsm: string;
  asm: string;
  province: string;
  region: string;
  ta: string;
  intern: string;
  label: string;
  applicantCount: number;
}

export type BranchInput = Omit<Branch, 'id' | 'label' | 'applicantCount'> & { id?: number };

const db = () => getSupabaseAdmin();

interface Row {
  id: number;
  shop_code: string | null;
  shop_name: string;
  company: string;
  main_unit: string | null;
  rsm: string | null;
  asm: string | null;
  province: string | null;
  region: string | null;
  ta: string | null;
  intern: string | null;
  label: string;
  applicants?: Array<{ count: number }>;
}

const toBranch = (r: Row): Branch => ({
  id: r.id,
  shopCode: r.shop_code ?? '',
  shopName: r.shop_name,
  company: r.company ?? '',
  mainUnit: r.main_unit ?? '',
  rsm: r.rsm ?? '',
  asm: r.asm ?? '',
  province: r.province ?? '',
  region: r.region ?? '',
  ta: r.ta ?? '',
  intern: r.intern ?? '',
  label: r.label,
  applicantCount: r.applicants?.[0]?.count ?? 0,
});

const COLS = 'id, shop_code, shop_name, company, main_unit, rsm, asm, province, region, ta, intern, label, applicants(count)';

export async function listBranches(): Promise<Branch[]> {
  const res = await db().from('branches').select(COLS).order('shop_code', { nullsFirst: false }).order('shop_name');
  if (res.error) throw new Error(`branches: ${res.error.message}`);
  return (res.data as unknown as Row[]).map(toBranch);
}

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export async function saveBranch(admin: AdminProfile, input: Partial<BranchInput>): Promise<Branch> {
  const values = {
    shop_code: clean(input.shopCode, 40) || null,
    shop_name: clean(input.shopName, 200),
    company: clean(input.company, 60) || 'Com7',
    main_unit: clean(input.mainUnit, 120) || null,
    rsm: clean(input.rsm, 120) || null,
    asm: clean(input.asm, 120) || null,
    province: clean(input.province, 80) || null,
    region: clean(input.region, 80) || null,
    ta: clean(input.ta, 120) || null,
    intern: clean(input.intern, 120) || null,
  };
  if (!values.shop_name) throw new AdminInputError('กรุณากรอกชื่อสาขา');

  // รหัสสาขาห้ามซ้ำ (ระบบเดิมใช้รหัสเป็นตัวระบุสาขา)
  if (values.shop_code) {
    let dup = db().from('branches').select('id').eq('shop_code', values.shop_code);
    if (input.id) dup = dup.neq('id', input.id);
    const { data } = await dup.limit(1);
    if (data?.length) throw new AdminInputError(`รหัสสาขา ${values.shop_code} มีอยู่แล้ว`);
  }

  const res = input.id
    ? await db().from('branches').update(values).eq('id', input.id).select(COLS).single()
    : await db().from('branches').insert(values).select(COLS).single();
  if (res.error) throw new Error(`save branch: ${res.error.message}`);
  const branch = toBranch(res.data as unknown as Row);

  await db().from('audit_log').insert({
    kind: 'audit',
    actor: adminDisplayName(admin),
    action: input.id ? 'แก้ไขข้อมูลสาขา' : 'เพิ่มสาขา',
    target_id: String(branch.id),
    target_name: branch.label,
    field: 'branch',
  });
  return branch;
}

export async function deleteBranch(admin: AdminProfile, id: number): Promise<{ id: number }> {
  const res = await db().from('branches').delete().eq('id', id).select('id, label').maybeSingle();
  if (res.error) throw new Error(`delete branch: ${res.error.message}`);
  if (!res.data) throw new AdminInputError('ไม่พบสาขานี้');
  // ผู้สมัครที่อ้างถึงสาขานี้ยังเก็บชื่อสาขาเป็นข้อความไว้ (branch_label) — branch_id ถูกล้างอัตโนมัติ
  await db().from('audit_log').insert({
    kind: 'audit',
    actor: adminDisplayName(admin),
    action: 'ลบสาขา',
    target_id: String(id),
    target_name: (res.data as { label: string }).label,
    field: 'branch',
  });
  return { id };
}
