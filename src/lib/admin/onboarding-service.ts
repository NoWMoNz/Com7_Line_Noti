import 'server-only';
/**
 * แจ้งเตือนเริ่มงาน (admin_getOnboardingList / admin_updateOnboardingInfo / admin_notifyOnboardingOne ของระบบเดิม)
 */
import { requiredDocsFor, summarizeApplicantDocs } from '@/lib/docs/status';
import type { DocScope, ReviewStatus } from '@/lib/docs/types';
import { serverEnv } from '@/lib/env';
import { createLineClient } from '@/lib/line/client';
import { DEFAULT_LOGO_URL } from '@/lib/line/flex';
import { createSupabaseRepo } from '@/lib/repo/supabase';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AdminAuthError, adminDisplayName } from './auth';
import {
  buildOnboardBubble,
  fillTemplate,
  findBranch,
  mergeTemplates,
  missingOnboardFields,
  ONBOARD_TEMPLATES_KEY,
  resolveTemplateKey,
  type OnboardEmployee,
  type OnboardTemplates,
} from './onboarding';
import { selectForApplicants } from './fetch-all';
import { canEditAfterOnboard, canSendOnboarding } from './roles';
import { AdminInputError } from './service';
import type { AdminProfile, BranchOption, OnboardingData, OnboardingInfoInput, OnboardingItem } from './types';

const db = () => getSupabaseAdmin();

function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const COLS =
  'id, code, name, phone, line_user_id, approved, required_doc_keys, branch_label, branch_id, company, position, start_date, salary, ta, onboard_notes, onboard_notified_at, onboard_updated_at, onboard_updated_by, completed_at, doc_scope, closed_status';

interface Row {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  line_user_id: string | null;
  approved: boolean;
  required_doc_keys: string[] | null;
  branch_label: string | null;
  branch_id: number | null;
  company: string | null;
  position: string | null;
  start_date: string | null;
  salary: number | string | null;
  ta: string | null;
  onboard_notes: string;
  onboard_notified_at: string | null;
  onboard_updated_at: string | null;
  onboard_updated_by: string | null;
  completed_at: string | null;
  doc_scope: DocScope;
  closed_status: string | null;
}

// ---------------------------------------------------------------------------
// สาขา → บริษัท

export async function branchOptions(): Promise<BranchOption[]> {
  const rows = ok(await db().from('branches').select('id, label, company').order('label'), 'branches') as BranchOption[];
  return rows.map((b) => ({ id: b.id, label: b.label, company: b.company ?? '' }));
}

async function branchIndex() {
  const rows = ok(await db().from('branches').select('id, label, company, shop_name'), 'branches') as Array<{
    id: number;
    label: string;
    company: string | null;
    shop_name: string;
  }>;
  return rows.map((b) => ({ id: b.id, label: b.label, company: b.company ?? '', shopName: b.shop_name }));
}

function companyOf(row: Row, branches: Awaited<ReturnType<typeof branchIndex>>): string {
  if (row.company?.trim()) return row.company.trim();
  const byId = row.branch_id ? branches.find((b) => b.id === row.branch_id) : null;
  return (byId ?? findBranch(row.branch_label ?? '', branches))?.company ?? '';
}

function toEmployee(row: Row, company: string): OnboardEmployee {
  return {
    name: row.name ?? '',
    phone: row.phone ?? '',
    branch: row.branch_label ?? '',
    company,
    position: row.position ?? '',
    startDate: row.start_date,
    salary: row.salary === null || row.salary === '' ? null : Number(row.salary) || null,
    ta: row.ta ?? '',
    notes: row.onboard_notes ?? '',
  };
}

// ---------------------------------------------------------------------------
// เทมเพลต

export async function getTemplates(): Promise<OnboardTemplates> {
  const res = ok(await db().from('settings').select('value').eq('key', ONBOARD_TEMPLATES_KEY).maybeSingle(), 'templates') as {
    value: unknown;
  } | null;
  return mergeTemplates(res?.value);
}

export async function saveTemplates(admin: AdminProfile, raw: unknown): Promise<OnboardTemplates> {
  if (!canSendOnboarding(admin.role)) throw new AdminAuthError(403, 'บัญชีของคุณไม่มีสิทธิ์แก้ไขเทมเพลตแจ้งเริ่มงาน');
  if (!raw || typeof raw !== 'object') throw new AdminInputError('ข้อมูลเทมเพลตไม่ถูกต้อง');
  const templates = mergeTemplates(raw);
  for (const t of Object.values(templates)) {
    if (t.template.length > 3000) throw new AdminInputError(`เทมเพลต ${t.label} ยาวเกินไป`);
  }
  ok(await db().from('settings').upsert({ key: ONBOARD_TEMPLATES_KEY, value: templates }), 'save templates');
  await db().from('audit_log').insert({ kind: 'audit', actor: adminDisplayName(admin), action: 'แก้ไขเทมเพลตแจ้งเริ่มงาน', field: 'onboard_templates' });
  return templates;
}

// ---------------------------------------------------------------------------
// รายชื่อ

/**
 * ผู้สมัครที่อนุมัติแล้ว + เอกสารอนุมัติครบทุกรายการ หรือเคยแจ้งเริ่มงานแล้ว (คงแสดงเสมอ)
 * ตัดสินด้วยกฎกลางอย่างเดียว (ไม่คัดด้วย completed_at — ข้อมูลเดิมบางคนอนุมัติครบแต่ไม่มีวันที่ส่งครบ)
 */
export async function listOnboarding(): Promise<OnboardingData> {
  const rows = ok(
    await db()
      .from('applicants')
      .select(COLS)
      .eq('approved', true)
      .is('closed_status', null)
      .order('start_date', { ascending: true, nullsFirst: false })
      .limit(1000),
    'onboarding list',
  ) as Row[];

  const ids = rows.filter((r) => !r.onboard_notified_at).map((r) => r.id);
  type FileRow = { applicant_id: string; doc_key: string; subitem_title: string };
  type ReviewRow = FileRow & { status: ReviewStatus; reason: string };
  const [allDocs, branches, templates, files, reviews] = await Promise.all([
    createSupabaseRepo(db()).getDocTypes(),
    branchIndex(),
    getTemplates(),
    selectForApplicants<FileRow>(db(), 'applicant_files', 'applicant_id, doc_key, subitem_title', ids, { currentOnly: true }),
    selectForApplicants<ReviewRow>(db(), 'doc_reviews', 'applicant_id, doc_key, subitem_title, status, reason', ids),
  ]);

  const items: OnboardingItem[] = [];
  for (const r of rows) {
    if (!r.onboard_notified_at) {
      // ส่งเฉพาะเอกสารเบื้องต้น → ยังไม่ถึงขั้นแจ้งเริ่มงาน (HR ต้องเปลี่ยนเป็น "ส่งทั้งหมด" ก่อน)
      if (r.doc_scope === 'initial') continue;
      const summary = summarizeApplicantDocs(
        requiredDocsFor(r.required_doc_keys, allDocs),
        files.filter((f) => f.applicant_id === r.id).map((f) => ({ docKey: f.doc_key, subitemTitle: f.subitem_title })),
        reviews
          .filter((x) => x.applicant_id === r.id)
          .map((x) => ({ docKey: x.doc_key, subitemTitle: x.subitem_title, status: x.status, reason: x.reason, reviewedBy: null, updatedAt: null })),
      );
      if (!summary.complete) continue; // ต้องอนุมัติครบทุกรายการ ไม่ใช่แค่ส่งครบ
    }
    const emp = toEmployee(r, companyOf(r, branches));
    items.push({
      id: r.id,
      code: r.code,
      ...emp,
      lineLinked: !!r.line_user_id,
      notifiedAt: r.onboard_notified_at,
      updatedAt: r.onboard_updated_at,
      updatedBy: r.onboard_updated_by,
    });
  }
  return { items, templates };
}

// ---------------------------------------------------------------------------
// แก้ข้อมูล / ส่ง

async function loadRow(id: string): Promise<Row> {
  const row = ok(await db().from('applicants').select(COLS).eq('id', id).maybeSingle(), 'load') as Row | null;
  if (!row) throw new AdminInputError('ไม่พบผู้สมัคร');
  return row;
}

const text = (v: unknown, max: number, label: string) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new AdminInputError(`${label}ยาวเกินไป`);
  return s;
};

export async function updateOnboardingInfo(admin: AdminProfile, id: string, input: OnboardingInfoInput): Promise<OnboardingItem> {
  const row = await loadRow(id);
  if (row.onboard_notified_at && !canEditAfterOnboard(admin.role)) {
    throw new AdminAuthError(403, 'ส่งแจ้งเตือนไปแล้ว ไม่สามารถแก้ไขข้อมูลนี้ได้ (เฉพาะ SuperAdmin ขึ้นไป)');
  }
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = text(input.name, 120, 'ชื่อ');
    if (!name) throw new AdminInputError('ชื่อต้องไม่ว่าง');
    patch.name = name;
  }
  if (input.phone !== undefined) {
    const phone = String(input.phone ?? '').replace(/\D/g, '');
    if (phone && !/^0\d{9}$/.test(phone)) throw new AdminInputError('เบอร์โทรต้องเป็น 10 หลัก ขึ้นต้นด้วย 0');
    patch.phone = phone || null;
  }
  if (input.branch !== undefined) {
    const label = text(input.branch, 200, 'สาขา');
    patch.branch_label = label || null;
    patch.branch_id = label ? findBranch(label, await branchIndex())?.id ?? null : null;
  }
  if (input.company !== undefined) patch.company = text(input.company, 60, 'บริษัท') || null;
  if (input.position !== undefined) patch.position = text(input.position, 120, 'ตำแหน่ง') || null;
  if (input.ta !== undefined) patch.ta = text(input.ta, 120, 'TA') || null;
  if (input.notes !== undefined) patch.onboard_notes = text(input.notes, 2000, 'หมายเหตุ');
  if (input.startDate !== undefined) {
    const d = input.startDate ? String(input.startDate) : '';
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new AdminInputError('วันที่เริ่มงานไม่ถูกต้อง');
    patch.start_date = d || null;
  }
  if (input.salary !== undefined) {
    const n = input.salary === null || (input.salary as unknown) === '' ? null : Number(input.salary);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 10_000_000)) throw new AdminInputError('เงินเดือนไม่ถูกต้อง');
    patch.salary = n;
  }
  patch.onboard_updated_at = new Date().toISOString();
  patch.onboard_updated_by = adminDisplayName(admin);

  ok(await db().from('applicants').update(patch).eq('id', id), 'update onboarding');
  await db()
    .from('audit_log')
    .insert({
      kind: 'audit',
      actor: adminDisplayName(admin),
      action: 'แก้ไขข้อมูลเริ่มงาน',
      target_id: row.code,
      target_name: row.name,
      field: 'onboarding',
      detail: Object.entries(patch)
        .filter(([k]) => !k.startsWith('onboard_updated'))
        .map(([k, v]) => `${k}=${v ?? ''}`)
        .join(' | '),
    });

  const fresh = await loadRow(id);
  return {
    id: fresh.id,
    code: fresh.code,
    ...toEmployee(fresh, companyOf(fresh, await branchIndex())),
    lineLinked: !!fresh.line_user_id,
    notifiedAt: fresh.onboard_notified_at,
    updatedAt: fresh.onboard_updated_at,
    updatedBy: fresh.onboard_updated_by,
  };
}

export async function sendOnboarding(admin: AdminProfile, id: string): Promise<{ notifiedAt: string }> {
  if (!canSendOnboarding(admin.role)) throw new AdminAuthError(403, 'บัญชีของคุณไม่มีสิทธิ์ส่งแจ้งเตือนเริ่มงาน');
  const row = await loadRow(id);
  if (!row.line_user_id) throw new AdminInputError('ผู้สมัครยังไม่ผูกบัญชี LINE');
  if (!row.approved) throw new AdminInputError('ผู้สมัครยังไม่ได้รับการอนุมัติ');
  if (row.closed_status) throw new AdminInputError('ใบสมัครนี้ถูกปิดแล้ว (Cancel/Turndown) — คืนสถานะก่อนส่ง');

  const [branches, templates] = await Promise.all([branchIndex(), getTemplates()]);
  const emp = toEmployee(row, companyOf(row, branches));
  const missing = missingOnboardFields(emp);
  if (missing.length) throw new AdminInputError(`กรุณากรอก ${missing.join(', ')} ก่อนส่ง`);

  const tpl = templates[resolveTemplateKey(emp.company, templates)] ?? templates.Default;
  const body = fillTemplate(tpl.template, emp);
  const logoUrl = serverEnv.lineLogoUrl() || DEFAULT_LOGO_URL;
  const altText = `แจ้งเตือนเริ่มงาน — คุณ${emp.name}`;
  const sent = await createLineClient(serverEnv.lineChannelAccessToken())
    .push(row.line_user_id, [{ type: 'flex', altText, contents: buildOnboardBubble(emp, body, tpl.color, logoUrl) }])
    .catch((err) => {
      console.error('[onboarding] push failed', err);
      return false;
    });

  await db().from('notification_log').insert({
    type: 'onboarding',
    applicant_id: row.id,
    applicant_name: row.name,
    phone: row.phone,
    sent_by: adminDisplayName(admin),
    status: sent ? 'ok' : 'error',
    message_preview: body.slice(0, 200),
    error: sent ? null : 'push failed',
  });
  if (!sent) throw new AdminInputError('ส่ง LINE ไม่สำเร็จ กรุณาลองใหม่');

  // แจ้งเริ่มงานแล้ว = จบกระบวนการเอกสาร: ล็อกชุดเอกสาร + ตั้งวันที่ส่งครบถ้ายังไม่มี
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { onboard_notified_at: now };
  if (!row.completed_at) patch.completed_at = now;
  if (!row.required_doc_keys?.length) {
    const allDocs = await createSupabaseRepo(db()).getDocTypes();
    patch.required_doc_keys = requiredDocsFor(null, allDocs).filter((d) => !d.coversAll).map((d) => d.key);
  }
  ok(await db().from('applicants').update(patch).eq('id', id), 'mark onboarded');
  await db().from('audit_log').insert({
    kind: 'audit',
    actor: adminDisplayName(admin),
    action: row.onboard_notified_at ? 'ส่งแจ้งเตือนเริ่มงานซ้ำ' : 'แจ้งเตือนเริ่มงาน',
    target_id: row.code,
    target_name: row.name,
    detail: `เทมเพลต ${tpl.label}`,
  });
  return { notifiedAt: now };
}

/** ส่งทุกคนที่ยังไม่ได้ส่งและข้อมูลครบ — คืนผลรายคน */
export async function sendOnboardingAll(admin: AdminProfile) {
  if (!canSendOnboarding(admin.role)) throw new AdminAuthError(403, 'บัญชีของคุณไม่มีสิทธิ์ส่งแจ้งเตือนเริ่มงาน');
  const { items } = await listOnboarding();
  const pending = items.filter((i) => !i.notifiedAt && i.lineLinked && missingOnboardFields(i).length === 0);
  const failed: Array<{ id: string; name: string; error: string }> = [];
  let sent = 0;
  for (const p of pending) {
    try {
      await sendOnboarding(admin, p.id);
      sent++;
    } catch (err) {
      failed.push({ id: p.id, name: p.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { sent, failed, total: pending.length };
}
