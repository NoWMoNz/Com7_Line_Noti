import 'server-only';
/**
 * ตั้งค่าประเภทเอกสาร (admin_getDocConfigManage / admin_addDocConfig / admin_updateDocConfig /
 * admin_setDocEnabled / admin_deleteDocConfig เดิม)
 *
 * ต่างจากระบบเดิม:
 *  - เปลี่ยนชื่อหัวข้อย่อย → ย้ายไฟล์และผลตรวจที่อ้างชื่อเดิมไปชื่อใหม่ด้วย (ระบบเดิมไฟล์จะหลุดจากหัวข้อ)
 *  - ลบเอกสารที่มีไฟล์แล้วไม่ได้ (ระบบเดิมลบได้แต่ไฟล์ค้าง) — ให้ปิดใช้งานแทน
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { adminDisplayName } from './auth';
import { AdminInputError } from './service';
import type { AdminProfile } from './types';

export interface DocSubitemSetting {
  title: string;
  optional: boolean;
  fileCount: number;
}
export interface DocTypeSetting {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  optional: boolean;
  coversAll: boolean;
  sortOrder: number;
  /** ไฟล์ของเอกสารทั้งชิ้น (ไม่รวมหัวข้อย่อย) */
  fileCount: number;
  subitems: DocSubitemSetting[];
}

export interface DocTypeInput {
  key?: string;
  label?: unknown;
  description?: unknown;
  enabled?: unknown;
  optional?: unknown;
  /** previousTitle = ชื่อเดิม (ถ้าเปลี่ยนชื่อ) */
  subitems?: Array<{ title?: unknown; optional?: unknown; previousTitle?: unknown }>;
}

const db = () => getSupabaseAdmin();

function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function audit(admin: AdminProfile, action: string, key: string, label: string, detail = '') {
  await db().from('audit_log').insert({ kind: 'audit', actor: adminDisplayName(admin), action, target_id: key, target_name: label, field: 'doc_type', detail });
}

export async function listDocTypes(): Promise<DocTypeSetting[]> {
  const [types, counts] = await Promise.all([
    db()
      .from('doc_types')
      .select('key, label, description, enabled, optional, covers_all, sort_order, doc_subitems(title, optional, sort_order)')
      .order('sort_order'),
    db().from('doc_file_counts').select('doc_key, subitem_title, file_count'),
  ]);
  const rows = ok(types, 'doc types') as Array<{
    key: string;
    label: string;
    description: string;
    enabled: boolean;
    optional: boolean;
    covers_all: boolean;
    sort_order: number;
    doc_subitems: Array<{ title: string; optional: boolean; sort_order: number }>;
  }>;
  const c = ok(counts, 'file counts') as Array<{ doc_key: string; subitem_title: string; file_count: number }>;
  const count = (key: string, sub: string) => c.find((x) => x.doc_key === key && x.subitem_title === sub)?.file_count ?? 0;

  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    description: r.description,
    enabled: r.enabled,
    optional: r.optional,
    coversAll: r.covers_all,
    sortOrder: r.sort_order,
    fileCount: count(r.key, ''),
    subitems: [...r.doc_subitems]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ title: s.title, optional: s.optional, fileCount: count(r.key, s.title) })),
  }));
}

/** key จากชื่อเอกสาร (เหมือนระบบเดิม: ใช้ตัวอังกฤษ/ตัวเลขในชื่อ ถ้าไม่มีใช้สุ่ม) */
export function makeDocKey(label: string): string {
  const ascii = label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
  return ascii.length >= 2 ? `doc_${ascii.slice(0, 36)}` : `doc_custom_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function cleanSubitems(raw: DocTypeInput['subitems']) {
  const list = (Array.isArray(raw) ? raw : []).map((s) => ({
    title: String(s?.title ?? '').replace(/\s+/g, ' ').trim(),
    optional: s?.optional === true,
    previousTitle: s?.previousTitle ? String(s.previousTitle) : null,
  }));
  if (list.length > 30) throw new AdminInputError('หัวข้อย่อยได้ไม่เกิน 30 หัวข้อ');
  const seen = new Set<string>();
  for (const s of list) {
    if (!s.title) throw new AdminInputError('ชื่อหัวข้อย่อยต้องไม่ว่าง');
    if (s.title.length > 120) throw new AdminInputError(`ชื่อหัวข้อย่อย "${s.title.slice(0, 20)}…" ยาวเกินไป`);
    if (seen.has(s.title)) throw new AdminInputError(`หัวข้อย่อย "${s.title}" ซ้ำกัน`);
    seen.add(s.title);
  }
  return list;
}

export async function saveDocType(admin: AdminProfile, input: DocTypeInput): Promise<DocTypeSetting[]> {
  const label = String(input.label ?? '').trim();
  if (!label) throw new AdminInputError('กรุณาระบุชื่อเอกสาร');
  if (label.length > 200) throw new AdminInputError('ชื่อเอกสารยาวเกินไป');
  const description = String(input.description ?? '').trim().slice(0, 500);
  const subitems = cleanSubitems(input.subitems);

  let key = input.key ? String(input.key) : '';
  const existing = key
    ? (ok(await db().from('doc_types').select('key, covers_all').eq('key', key).maybeSingle(), 'load doc') as { key: string; covers_all: boolean } | null)
    : null;
  if (key && !existing) throw new AdminInputError('ไม่พบเอกสารนี้');

  if (!existing) {
    key = makeDocKey(label);
    const dup = ok(await db().from('doc_types').select('key').eq('key', key).maybeSingle(), 'dup');
    if (dup) key = `${key.slice(0, 40)}_${crypto.randomUUID().slice(0, 6)}`;
    const max = ok(await db().from('doc_types').select('sort_order').order('sort_order', { ascending: false }).limit(1), 'max') as Array<{ sort_order: number }>;
    ok(
      await db().from('doc_types').insert({
        key,
        label,
        description,
        enabled: input.enabled !== false,
        optional: input.optional === true,
        sort_order: (max[0]?.sort_order ?? 0) + 1,
      }),
      'insert doc',
    );
  } else {
    ok(
      await db()
        .from('doc_types')
        .update({
          label,
          description,
          ...(input.enabled !== undefined ? { enabled: input.enabled === true } : {}),
          ...(input.optional !== undefined && !existing.covers_all ? { optional: input.optional === true } : {}),
        })
        .eq('key', key),
      'update doc',
    );
  }

  if (existing?.covers_all && subitems.length) throw new AdminInputError('ไฟล์รวมไม่มีหัวข้อย่อย');

  // ----- หัวข้อย่อย -----
  const current = ok(await db().from('doc_subitems').select('title').eq('doc_key', key), 'subitems') as Array<{ title: string }>;
  const renames = subitems.filter((s) => s.previousTitle && s.previousTitle !== s.title && current.some((c) => c.title === s.previousTitle));
  const keepTitles = new Set([...subitems.map((s) => s.previousTitle ?? s.title)]);
  const removed = current.filter((c) => !keepTitles.has(c.title)).map((c) => c.title);

  // ลบแถวหัวข้อเดิมทั้งหมดแล้วใส่ใหม่ตามลำดับ (PK คือ doc_key+title จึงเปลี่ยนชื่อด้วย update ตรงๆ ไม่สะดวก)
  ok(await db().from('doc_subitems').delete().eq('doc_key', key), 'clear subitems');
  if (subitems.length) {
    ok(
      await db()
        .from('doc_subitems')
        .insert(subitems.map((s, i) => ({ doc_key: key, title: s.title, optional: s.optional, sort_order: i }))),
      'insert subitems',
    );
  }
  // ไฟล์และผลตรวจที่อ้างชื่อเดิม → ชื่อใหม่
  for (const r of renames) {
    ok(await db().from('applicant_files').update({ subitem_title: r.title }).eq('doc_key', key).eq('subitem_title', r.previousTitle!), 'rename files');
    ok(await db().from('doc_reviews').update({ subitem_title: r.title }).eq('doc_key', key).eq('subitem_title', r.previousTitle!), 'rename reviews');
  }

  await audit(
    admin,
    existing ? 'แก้ไขประเภทเอกสาร' : 'เพิ่มประเภทเอกสาร',
    key,
    label,
    [
      renames.length ? `เปลี่ยนชื่อหัวข้อ: ${renames.map((r) => `${r.previousTitle} → ${r.title}`).join(', ')}` : '',
      removed.length ? `ลบหัวข้อ: ${removed.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  );
  return listDocTypes();
}

/** สลับลำดับกับเอกสารข้างเคียง */
export async function moveDocType(admin: AdminProfile, key: string, direction: 'up' | 'down'): Promise<DocTypeSetting[]> {
  const all = ok(await db().from('doc_types').select('key, sort_order').order('sort_order'), 'order') as Array<{ key: string; sort_order: number }>;
  const i = all.findIndex((d) => d.key === key);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0) throw new AdminInputError('ไม่พบเอกสารนี้');
  if (j < 0 || j >= all.length) return listDocTypes();
  // ใช้ลำดับ index ใหม่ทั้งชุด กันกรณี sort_order ซ้ำกันจากข้อมูลเดิม
  const order = all.map((d) => d.key);
  [order[i], order[j]] = [order[j], order[i]];
  for (const [n, k] of order.entries()) {
    if (all.find((d) => d.key === k)!.sort_order !== n) ok(await db().from('doc_types').update({ sort_order: n }).eq('key', k), 'reorder');
  }
  await audit(admin, 'เปลี่ยนลำดับเอกสาร', key, key, direction);
  return listDocTypes();
}

export async function deleteDocType(admin: AdminProfile, key: string): Promise<DocTypeSetting[]> {
  const doc = ok(await db().from('doc_types').select('key, label, covers_all').eq('key', key).maybeSingle(), 'load') as {
    key: string;
    label: string;
    covers_all: boolean;
  } | null;
  if (!doc) throw new AdminInputError('ไม่พบเอกสารนี้');
  const { count } = await db().from('applicant_files').select('id', { count: 'exact', head: true }).eq('doc_key', key);
  if (count) throw new AdminInputError(`มีไฟล์ของผู้สมัคร ${count} ไฟล์ในเอกสารนี้ — ลบไม่ได้ ให้ปิดใช้งานแทน`);
  ok(await db().from('doc_types').delete().eq('key', key), 'delete doc');
  await audit(admin, 'ลบประเภทเอกสาร', key, doc.label);
  return listDocTypes();
}
