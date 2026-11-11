import 'server-only';
/**
 * งานของหน้าแอดมิน: รายชื่อ, รายละเอียด, อนุมัติ, ตรวจเอกสาร, ข้อความถึงผู้สมัคร, ยกเลิกการผูก LINE
 * ทุกฟังก์ชันต้องเรียกหลัง requireAdmin() แล้วเท่านั้น
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { requiredDocsFor, summarizeApplicantDocs } from '@/lib/docs/status';
import type { Applicant, ClosedStatus, DocReview, DocScope, DocType, FileSlotRef, ReviewStatus } from '@/lib/docs/types';
import { serverEnv } from '@/lib/env';
import { createLineClient } from '@/lib/line/client';
import { DEFAULT_LOGO_URL } from '@/lib/line/flex';
import { buildAppLink } from '@/lib/line/handler';
import type { LineMessage } from '@/lib/line/types';
import { createSupabaseRepo, DOCS_BUCKET } from '@/lib/repo/supabase';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { adminDisplayName } from './auth';
import { applicantIdsWithReview, selectForApplicants } from './fetch-all';
import {
  applicantStage,
  buildApprovalMessage,
  buildMoreDocsMessage,
  buildReviewMessages,
  completionChange,
  countPendingReview,
  validateReviewItems,
} from './logic';
import type {
  AdminDocView,
  AdminProfile,
  ApplicantDetail,
  ApplicantListFilter,
  ApplicantListItem,
  ApplicantListResult,
  ApplicantListView,
  ApplicantStage,
  FileView,
  ReviewView,
} from './types';

export class AdminInputError extends Error {}

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;
const COLS =
  'id, code, name, phone, approved, line_user_id, access_token, required_doc_keys, admin_feedback, onboard_notified_at, pdpa_version, pdpa_accepted_at, created_at, last_uploaded_at, completed_at, branch_label, notes, deadline, ta, intern, company, position, start_date, doc_scope, closed_status, closed_reason, closed_at, closed_by';

interface Row {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  approved: boolean;
  line_user_id: string | null;
  access_token: string;
  required_doc_keys: string[] | null;
  admin_feedback: string | null;
  onboard_notified_at: string | null;
  pdpa_version: string | null;
  pdpa_accepted_at: string | null;
  created_at: string;
  last_uploaded_at: string | null;
  completed_at: string | null;
  branch_label: string | null;
  notes: string;
  deadline: string | null;
  ta: string | null;
  intern: string | null;
  company: string | null;
  position: string | null;
  start_date: string | null;
  doc_scope: DocScope;
  closed_status: ClosedStatus | null;
  closed_reason: string;
  closed_at: string | null;
  closed_by: string | null;
}

const toApplicant = (r: Row): Applicant => ({
  id: r.id,
  code: r.code,
  name: r.name ?? '',
  phone: r.phone,
  approved: r.approved,
  lineUserId: r.line_user_id,
  accessToken: r.access_token,
  requiredDocKeys: r.required_doc_keys,
  docScope: r.doc_scope ?? 'all',
  closedStatus: r.closed_status ?? null,
  adminFeedback: r.admin_feedback ?? '',
  onboardNotified: !!r.onboard_notified_at,
  pdpaVersion: r.pdpa_version,
  pdpaAcceptedAt: r.pdpa_accepted_at,
});

function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const db = (): SupabaseClient => getSupabaseAdmin();
const docTypes = () => createSupabaseRepo(db()).getDocTypes();

function lineConfig() {
  return {
    line: createLineClient(serverEnv.lineChannelAccessToken()),
    logoUrl: serverEnv.lineLogoUrl() || DEFAULT_LOGO_URL,
    handler: {
      liffId: serverEnv.liffId(),
      appBaseUrl: serverEnv.appBaseUrl(),
      logoUrl: null,
      maxUploadBytes: serverEnv.maxUploadBytes(),
    },
  };
}

async function loadRow(id: string): Promise<Row> {
  const row = ok(await db().from('applicants').select(COLS).eq('id', id).maybeSingle(), 'load applicant') as Row | null;
  if (!row) throw new AdminInputError('ไม่พบผู้สมัคร');
  return row;
}

type ReviewRow = { applicant_id: string; doc_key: string; subitem_title: string; status: ReviewStatus; reason: string; reviewed_by: string | null; updated_at: string | null };
const toReview = (r: ReviewRow): DocReview => ({
  docKey: r.doc_key,
  subitemTitle: r.subitem_title,
  status: r.status,
  reason: r.reason,
  reviewedBy: r.reviewed_by,
  updatedAt: r.updated_at,
});

async function audit(admin: AdminProfile, action: string, row: Row, detail: string, field?: string) {
  const res = await db().from('audit_log').insert({
    kind: 'audit',
    actor: adminDisplayName(admin),
    action,
    target_id: row.code,
    target_name: row.name,
    field: field ?? null,
    detail,
  });
  if (res.error) console.error('[admin] audit', res.error.message);
}

async function pushAndLog(row: Row, type: string, preview: string, messages: LineMessage[], sentBy: string) {
  if (!row.line_user_id) return false;
  const { line } = lineConfig();
  const sent = await line.push(row.line_user_id, messages).catch((err) => {
    console.error('[admin] push failed', type, err);
    return false;
  });
  const res = await db().from('notification_log').insert({
    type,
    applicant_id: row.id,
    applicant_name: row.name,
    phone: row.phone,
    sent_by: sentBy,
    status: sent ? 'ok' : 'error',
    message_preview: preview.slice(0, 200),
    error: sent ? null : 'push failed',
  });
  if (res.error) console.error('[admin] notification_log', res.error.message);
  return sent;
}

// ---------------------------------------------------------------------------
// รายชื่อ

/**
 * ผู้สมัครที่อนุมัติเอกสารครบทุกรายการแล้ว แต่ยังไม่แจ้งเริ่มงาน — คนกลุ่มนี้ไปอยู่หน้าแจ้งเริ่มงาน
 * ตัดสินด้วย "อนุมัติครบ" ตามกฎกลางอย่างเดียว (เหมือน listOnboarding)
 */
async function fullyApprovedIds(allDocs: DocType[]): Promise<string[]> {
  const rows = ok(
    await db()
      .from('applicants')
      .select('id, required_doc_keys')
      .eq('approved', true)
      .is('onboard_notified_at', null)
      .is('closed_status', null)
      .eq('doc_scope', 'all')
      .limit(1000),
    'fully approved candidates',
  ) as Array<{ id: string; required_doc_keys: string[] | null }>;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [files, reviews] = await Promise.all([
    selectForApplicants<{ applicant_id: string; doc_key: string; subitem_title: string }>(
      db(),
      'applicant_files',
      'applicant_id, doc_key, subitem_title',
      ids,
      { currentOnly: true },
    ),
    selectForApplicants<ReviewRow>(db(), 'doc_reviews', 'applicant_id, doc_key, subitem_title, status, reason, reviewed_by, updated_at', ids),
  ]);
  return rows
    .filter(
      (r) =>
        summarizeApplicantDocs(
          requiredDocsFor(r.required_doc_keys, allDocs),
          files.filter((f) => f.applicant_id === r.id).map((f) => ({ docKey: f.doc_key, subitemTitle: f.subitem_title })),
          reviews.filter((x) => x.applicant_id === r.id).map(toReview),
        ).complete,
    )
    .map((r) => r.id);
}

export async function listApplicants(opts: {
  q: string;
  filter: ApplicantListFilter;
  view?: ApplicantListView | null;
  page: number;
}): Promise<ApplicantListResult> {
  const page = Math.max(1, Math.floor(opts.page) || 1);
  // ตัดอักขระที่มีความหมายในไวยากรณ์ filter ของ PostgREST ออก
  const q = opts.q.replace(/[,()*%\\:]/g, ' ').trim().slice(0, 60);
  const view = opts.view ?? null;
  const allDocs = await docTypes();

  /** ค้นหาชื่อ / รหัส / เบอร์ */
  const withSearch = <T extends { or: (f: string) => T }>(query: T): T => {
    if (!q) return query;
    const digits = q.replace(/\D/g, '');
    const parts = [`name.ilike.*${q}*`, `code.ilike.*${q}*`];
    if (digits.length >= 3) parts.push(`phone.ilike.*${digits}*`);
    return query.or(parts.join(','));
  };

  let rows: Row[];
  let total: number;
  let movedToOnboarding = 0;

  if (view === 'review' || view === 'rejected') {
    // ผู้สมัครที่มีผลตรวจสถานะนี้ (นิยามเดียวกับตัวเลขในหน้าภาพรวม)
    const flagged = [...(await applicantIdsWithReview(db(), view === 'review' ? 'pending_review' : 'rejected'))];
    const candidates: Array<{ id: string; last_uploaded_at: string | null; created_at: string }> = [];
    for (let i = 0; i < flagged.length; i += 80) {
      const res = await withSearch(
        db()
          .from('applicants')
          .select('id, last_uploaded_at, created_at')
          .in('id', flagged.slice(i, i + 80))
          .eq('approved', true)
          .is('onboard_notified_at', null)
          .is('closed_status', null),
      );
      candidates.push(...(ok(res, 'view candidates') as typeof candidates));
    }
    // รอตรวจ: รอนานสุดขึ้นก่อน (ตรวจตามคิว) / รอผู้สมัครแก้: ล่าสุดก่อน
    const t = (c: (typeof candidates)[number]) => new Date(c.last_uploaded_at ?? c.created_at).getTime();
    candidates.sort((a, b) => (view === 'review' ? t(a) - t(b) : t(b) - t(a)));
    total = candidates.length;
    const pageIds = candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c) => c.id);
    const res = pageIds.length ? await db().from('applicants').select(COLS).in('id', pageIds) : { data: [], error: null };
    const byId = new Map((ok(res, 'view rows') as Row[]).map((r) => [r.id, r]));
    rows = pageIds.map((id) => byId.get(id)).filter((r): r is Row => !!r);
  } else {
    // อนุมัติเอกสารครบ / แจ้งเริ่มงานแล้ว → ย้ายไปหน้าแจ้งเริ่มงาน ไม่ปนกับคนที่ยังต้องตรวจ
    // (พิมพ์ค้นหายังเจอทุกคน เผื่อต้องเปิดดูเอกสารย้อนหลัง)
    const hideDone = !q && !view && (opts.filter === 'all' || opts.filter === 'approved');
    const [doneIds, onboarded] = hideDone
      ? await Promise.all([
          fullyApprovedIds(allDocs),
          db()
            .from('applicants')
            .select('id', { count: 'exact', head: true })
            .not('onboard_notified_at', 'is', null)
            .is('closed_status', null),
        ])
      : [[], null];
    if (onboarded?.error) throw new Error(`onboarded count: ${onboarded.error.message}`);
    movedToOnboarding = doneIds.length + (onboarded?.count ?? 0);

    let query = db()
      .from('applicants')
      .select(COLS, { count: 'exact' })
      .order(view === 'new7d' ? 'created_at' : 'last_uploaded_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (view) {
      // มุมมองด่วนจากหน้าภาพรวม — ไม่รวมคนที่ปิดใบสมัครแล้ว
      query = query.is('closed_status', null);
      const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS).toISOString();
      if (view === 'no_profile') query = query.or('name.eq.,phone.is.null');
      if (view === 'new7d') query = query.gte('created_at', new Date(Date.now() - 7 * DAY_MS).toISOString());
      if (view === 'stale3d') {
        query = query
          .eq('approved', true)
          .is('completed_at', null)
          .is('onboard_notified_at', null)
          .or(`last_uploaded_at.lt.${threeDaysAgo},and(last_uploaded_at.is.null,created_at.lt.${threeDaysAgo})`);
      }
    } else {
      // รออนุมัติ = กรอกข้อมูลครบแล้ว รอ HR อนุมัติ (คนที่ยังไม่กรอกข้อมูลดูได้ที่ "ทั้งหมด")
      if (opts.filter === 'pending_approval') query = query.eq('approved', false).neq('name', '').not('phone', 'is', null);
      if (opts.filter === 'approved') query = query.eq('approved', true);
      // Cancel/Turndown อยู่แท็บของตัวเอง — แท็บอื่นไม่แสดง (ยกเว้นค้นหาในแท็บ "ทั้งหมด" ให้เจอทุกคน)
      if (opts.filter === 'closed') query = query.not('closed_status', 'is', null);
      else if (!q || opts.filter !== 'all') query = query.is('closed_status', null);
      if (hideDone) {
        query = query.is('onboard_notified_at', null);
        if (doneIds.length) query = query.not('id', 'in', `(${doneIds.join(',')})`);
      }
    }

    const res = await withSearch(query);
    rows = ok(res, 'list applicants') as Row[];
    total = res.count ?? rows.length;
  }

  const ids = rows.map((r) => r.id);
  const [files, reviews] = await Promise.all([
    selectForApplicants<{ applicant_id: string; doc_key: string; subitem_title: string }>(
      db(),
      'applicant_files',
      'applicant_id, doc_key, subitem_title',
      ids,
      { currentOnly: true },
    ),
    selectForApplicants<ReviewRow>(db(), 'doc_reviews', 'applicant_id, doc_key, subitem_title, status, reason, reviewed_by, updated_at', ids),
  ]);

  const items: ApplicantListItem[] = rows.map((r) => {
    const a = toApplicant(r);
    const docs = requiredDocsFor(a.requiredDocKeys, allDocs, a.docScope);
    const myFiles: FileSlotRef[] = files
      .filter((f) => f.applicant_id === r.id)
      .map((f) => ({ docKey: f.doc_key, subitemTitle: f.subitem_title }));
    const myReviews = reviews.filter((x) => x.applicant_id === r.id).map(toReview);
    const summary = a.approved ? summarizeApplicantDocs(docs, myFiles, myReviews) : null;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      phone: r.phone ?? '',
      approved: r.approved,
      lineLinked: !!r.line_user_id,
      stage: applicantStage(a, summary, myReviews),
      docScope: a.docScope,
      closedReason: r.closed_reason ?? '',
      satisfied: summary?.satisfiedCount ?? 0,
      total: summary?.total ?? docs.filter((d) => !d.coversAll && !d.optional).length,
      pendingReview: countPendingReview(myReviews, docs),
      createdAt: r.created_at,
      lastUploadedAt: r.last_uploaded_at,
    };
  });
  return { items, total, page, pageSize: PAGE_SIZE, movedToOnboarding };
}

// ---------------------------------------------------------------------------
// รายละเอียด

export async function getApplicantDetail(id: string): Promise<ApplicantDetail> {
  const row = await loadRow(id);
  const a = toApplicant(row);
  const [allDocs, filesRes, reviewsRes] = await Promise.all([
    docTypes(),
    db()
      .from('applicant_files')
      .select('id, doc_key, subitem_title, mime_type, size_bytes, created_at, source, storage_path, legacy_url')
      .eq('applicant_id', id)
      .eq('is_current', true)
      .order('created_at'),
    db().from('doc_reviews').select('applicant_id, doc_key, subitem_title, status, reason, reviewed_by, updated_at').eq('applicant_id', id),
  ]);
  const files = ok(filesRes, 'detail files') as Array<{
    id: string;
    doc_key: string;
    subitem_title: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    source: string;
    storage_path: string | null;
    legacy_url: string | null;
  }>;
  const reviews = (ok(reviewsRes, 'detail reviews') as ReviewRow[]).map(toReview);

  const required = requiredDocsFor(a.requiredDocKeys, allDocs, a.docScope);
  const summary = summarizeApplicantDocs(required, files.map((f) => ({ docKey: f.doc_key, subitemTitle: f.subitem_title })), reviews);
  // แสดงเอกสารในชุดของคนนี้ + เอกสารอื่นที่มีไฟล์อยู่ (เช่น ถูกปิดไปแล้วภายหลัง)
  const shown = allDocs.filter((d) => required.some((r) => r.key === d.key) || files.some((f) => f.doc_key === d.key));

  const fileViews = (docKey: string, sub: string): FileView[] =>
    files
      .filter((f) => f.doc_key === docKey && f.subitem_title === sub)
      .map((f) => ({
        id: f.id,
        mimeType: f.mime_type,
        sizeBytes: f.size_bytes,
        createdAt: f.created_at,
        source: f.source,
        legacy: !f.storage_path && !!f.legacy_url,
      }));
  const reviewOf = (docKey: string, sub: string): ReviewView | null => {
    const r = reviews.find((x) => x.docKey === docKey && x.subitemTitle === sub);
    return r ? { status: r.status, reason: r.reason, reviewedBy: r.reviewedBy, updatedAt: r.updatedAt } : null;
  };

  const docs: AdminDocView[] = shown.map((d) => {
    // เอกสารบังคับใช้สถานะจากกฎกลาง ส่วนไฟล์รวม/ไม่บังคับคิดแยกด้วยกฎเดียวกัน
    const st =
      summary.docs.find((s) => s.doc.key === d.key) ??
      summarizeApplicantDocs(
        [{ ...d, optional: false, coversAll: false }],
        files.map((f) => ({ docKey: f.doc_key, subitemTitle: f.subitem_title })),
        reviews,
      ).docs[0];
    return {
      key: d.key,
      label: d.label,
      description: d.description,
      optional: d.optional,
      coversAll: d.coversAll,
      state: st.state,
      reason: st.reason,
      review: reviewOf(d.key, ''),
      files: fileViews(d.key, ''),
      checks: d.checks,
      subitems: d.subitems.map((s, i) => ({
        title: s.title,
        optional: s.optional,
        state: st.subitems[i]?.state ?? 'missing',
        review: reviewOf(d.key, s.title),
        files: fileViews(d.key, s.title),
      })),
    };
  });

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone ?? '',
    approved: row.approved,
    lineLinked: !!row.line_user_id,
    stage: applicantStage(a, a.approved ? summary : null, reviews),
    docScope: a.docScope,
    closed: row.closed_status
      ? { status: row.closed_status, reason: row.closed_reason ?? '', at: row.closed_at, by: row.closed_by }
      : null,
    feedback: row.admin_feedback ?? '',
    pdpaVersion: row.pdpa_version,
    pdpaAcceptedAt: row.pdpa_accepted_at,
    onboardNotified: !!row.onboard_notified_at,
    createdAt: row.created_at,
    lastUploadedAt: row.last_uploaded_at,
    completedAt: row.completed_at,
    info: {
      branch: row.branch_label ?? '',
      notes: row.notes ?? '',
      deadline: row.deadline,
      ta: row.ta ?? '',
      intern: row.intern ?? '',
      company: row.company ?? '',
      position: row.position ?? '',
      startDate: row.start_date,
    },
    satisfied: summary.satisfiedCount,
    total: summary.total,
    docs,
  };
}

// ---------------------------------------------------------------------------
// คำสั่ง

const isDocsDone = (stage: ApplicantStage) => stage === 'complete' || stage === 'initial_complete';

const CLOSED_LABEL: Record<ClosedStatus, string> = { cancel: 'Cancel (ยกเลิก)', turndown: 'Turndown (ผู้สมัครปฏิเสธ)' };

/**
 * ปิดใบสมัคร (Cancel / Turndown) หรือคืนสถานะ (status = null)
 * ปิดแล้ว: ย้ายไปแท็บ Cancel/Turndown, ไม่ถูกเตือนเอกสาร, ไม่ขึ้นหน้าแจ้งเริ่มงาน — ข้อมูลและไฟล์ยังอยู่ครบ
 */
export async function setClosedStatus(admin: AdminProfile, id: string, rawStatus: unknown, rawReason: unknown) {
  const row = await loadRow(id);
  let status: ClosedStatus | null;
  if (rawStatus === 'cancel' || rawStatus === 'turndown') status = rawStatus;
  else if (rawStatus === null || rawStatus === undefined || rawStatus === '') status = null;
  else throw new AdminInputError('สถานะไม่ถูกต้อง');
  const reason = String(rawReason ?? '').trim();
  if (reason.length > 500) throw new AdminInputError('เหตุผลยาวเกินไป (ไม่เกิน 500 ตัวอักษร)');
  if (!status && !row.closed_status) throw new AdminInputError('ใบสมัครนี้ยังไม่ได้ถูกปิด');

  const patch = status
    ? { closed_status: status, closed_reason: reason, closed_at: new Date().toISOString(), closed_by: adminDisplayName(admin) }
    : { closed_status: null, closed_reason: '', closed_at: null, closed_by: null };
  ok(await db().from('applicants').update(patch).eq('id', id), 'set closed status');
  await audit(
    admin,
    status ? `ปิดใบสมัคร: ${CLOSED_LABEL[status]}` : 'คืนสถานะใบสมัคร',
    row,
    status ? reason || '-' : `เดิม: ${row.closed_status ? CLOSED_LABEL[row.closed_status] : '-'}`,
    'closed_status',
  );
  return getApplicantDetail(id);
}

/**
 * เปลี่ยนชุดเอกสารที่ต้องส่ง: initial = เฉพาะเอกสารเบื้องต้น / all = ทั้งหมด
 * ล้าง snapshot แล้วคำนวณ "ส่งครบ" ใหม่ตามชุดใหม่ — เบื้องต้น → ทั้งหมด จะเห็นเอกสารที่เหลือทันที
 */
export async function setDocScope(admin: AdminProfile, id: string, rawScope: unknown, notify: boolean) {
  const row = await loadRow(id);
  if (rawScope !== 'initial' && rawScope !== 'all') throw new AdminInputError('ชุดเอกสารไม่ถูกต้อง');
  const scope: DocScope = rawScope;
  if (row.doc_scope === scope) return getApplicantDetail(id);
  if (row.onboard_notified_at) throw new AdminInputError('แจ้งเริ่มงานแล้ว เปลี่ยนชุดเอกสารไม่ได้');

  const allDocs = await docTypes();
  const [filesRes, reviewsRes] = await Promise.all([
    db().from('applicant_files').select('doc_key, subitem_title').eq('applicant_id', id).eq('is_current', true),
    db().from('doc_reviews').select('applicant_id, doc_key, subitem_title, status, reason, reviewed_by, updated_at').eq('applicant_id', id),
  ]);
  const files = (ok(filesRes, 'files') as Array<{ doc_key: string; subitem_title: string }>).map((f) => ({
    docKey: f.doc_key,
    subitemTitle: f.subitem_title,
  }));
  const reviews = (ok(reviewsRes, 'reviews') as ReviewRow[]).map(toReview);
  // ชุดเอกสารคิดใหม่จากที่เปิดใช้งานปัจจุบัน (ไม่ใช้ snapshot เดิม)
  const required = requiredDocsFor(null, allDocs, scope);
  const complete = summarizeApplicantDocs(required, files, reviews).allSatisfied;
  const change = completionChange(complete, null, null, required, scope);

  ok(
    await db()
      .from('applicants')
      .update({
        doc_scope: scope,
        completed_at: complete ? (row.completed_at ?? change.completedAt ?? null) : null,
        required_doc_keys: change.requiredDocKeys ?? null,
      })
      .eq('id', id),
    'set doc scope',
  );
  await audit(admin, 'เปลี่ยนชุดเอกสาร', row, scope === 'initial' ? 'ส่งทั้งหมด → ส่งเบื้องต้น' : 'ส่งเบื้องต้น → ส่งทั้งหมด', 'doc_scope');

  // เบื้องต้น → ทั้งหมด: แจ้งผู้สมัครให้ส่งเอกสารที่เหลือ
  if (scope === 'all' && notify && row.approved && !complete && !row.closed_status) {
    const { handler, logoUrl } = lineConfig();
    const msg = buildMoreDocsMessage(row.name, buildAppLink(handler), logoUrl);
    await pushAndLog(row, 'more_docs', msg.altText, [{ type: 'flex', altText: msg.altText, contents: msg.bubble }], adminDisplayName(admin));
  }
  return getApplicantDetail(id);
}

export async function setApproval(admin: AdminProfile, id: string, approved: boolean, notify: boolean) {
  const row = await loadRow(id);
  ok(await db().from('applicants').update({ approved }).eq('id', id), 'set approval');
  await audit(
    admin,
    approved ? 'อนุมัติผู้สมัคร' : 'ยกเลิกการอนุมัติ',
    row,
    approved ? 'อนุมัติให้ผู้สมัครเริ่มอัปโหลดเอกสารได้' : 'ยกเลิกสิทธิ์อัปโหลดเอกสารชั่วคราว',
    'approved',
  );
  if (approved && !row.approved && notify) {
    const { handler, logoUrl } = lineConfig();
    const msg = buildApprovalMessage(row.name, buildAppLink(handler), logoUrl);
    await pushAndLog(row, 'approved', msg.altText, [{ type: 'flex', altText: msg.altText, contents: msg.bubble }], adminDisplayName(admin));
  }
  return getApplicantDetail(id);
}

export async function reviewDocuments(admin: AdminProfile, id: string, rawItems: unknown, notify: boolean) {
  const row = await loadRow(id);
  const allDocs = await docTypes();
  const items = validateReviewItems(rawItems, allDocs);
  const now = new Date().toISOString();
  const by = adminDisplayName(admin);
  const wasComplete = isDocsDone((await getApplicantDetail(id)).stage);

  ok(
    await db()
      .from('doc_reviews')
      .upsert(
        items.map((i) => ({
          applicant_id: id,
          doc_key: i.docKey,
          subitem_title: i.subitemTitle,
          status: i.status,
          reason: i.reason,
          reviewed_by: by,
          updated_at: now,
        })),
      ),
    'save reviews',
  );
  // อนุมัติทั้งเอกสาร → ล้างผลตรวจรายหัวข้อเก่าที่ค้าง (ไม่ให้สถานะเก่าย้อนกลับมา)
  for (const i of items.filter((x) => x.status === 'approved' && !x.subitemTitle)) {
    ok(
      await db().from('doc_reviews').delete().eq('applicant_id', id).eq('doc_key', i.docKey).neq('subitem_title', ''),
      'clear sub reviews',
    );
  }

  // สถานะหลังตรวจ → completed_at / snapshot / ข้อความแอดมิน / รอบติดตาม 3 วัน
  const [filesRes, reviewsRes] = await Promise.all([
    db().from('applicant_files').select('doc_key, subitem_title').eq('applicant_id', id).eq('is_current', true),
    db().from('doc_reviews').select('applicant_id, doc_key, subitem_title, status, reason, reviewed_by, updated_at').eq('applicant_id', id),
  ]);
  const files = (ok(filesRes, 'files') as Array<{ doc_key: string; subitem_title: string }>).map((f) => ({
    docKey: f.doc_key,
    subitemTitle: f.subitem_title,
  }));
  const reviews = (ok(reviewsRes, 'reviews') as ReviewRow[]).map(toReview);
  const required = requiredDocsFor(row.required_doc_keys, allDocs, row.doc_scope);
  const summary = summarizeApplicantDocs(required, files, reviews);
  // "ส่งครบ" ตามความหมายของระบบเดิม (ดู completionChange)
  const complete = summary.allSatisfied || !!row.onboard_notified_at;
  const change = completionChange(complete, row.completed_at, row.required_doc_keys, required, row.doc_scope);

  const patch: Record<string, unknown> = {
    admin_reviewed_at: now,
    followup_sent_at: null,
    followup_status: 'pending',
  };
  if (change.completedAt !== undefined) patch.completed_at = change.completedAt;
  if (change.requiredDocKeys) patch.required_doc_keys = change.requiredDocKeys;
  if (complete && items.some((i) => i.status === 'approved')) patch.admin_feedback = '';
  ok(await db().from('applicants').update(patch).eq('id', id), 'update after review');

  await audit(
    admin,
    'ตรวจเอกสาร',
    row,
    items.map((i) => `${i.docKey}${i.subitemTitle ? `/${i.subitemTitle}` : ''} → ${i.status}${i.reason ? ` (${i.reason})` : ''}`).join(' | '),
  );

  const detail = await getApplicantDetail(id);
  if (notify) {
    const { logoUrl, handler } = lineConfig();
    const messages = buildReviewMessages({
      applicantName: row.name,
      items,
      allDocs,
      becameComplete: !wasComplete && isDocsDone(detail.stage),
      initialOnly: detail.docScope === 'initial',
      linkFor: (doc) => buildAppLink(handler, { doc }),
      logoUrl,
    });
    for (const m of messages) {
      await pushAndLog(
        row,
        m.type === 'rejected' ? 'doc_rejected' : 'docs_all_approved',
        m.altText,
        [{ type: 'flex', altText: m.altText, contents: m.bubble }],
        by,
      );
    }
  }
  return detail;
}

export async function setFeedback(admin: AdminProfile, id: string, rawText: unknown, sendLine: boolean) {
  const row = await loadRow(id);
  const text = String(rawText ?? '').trim();
  if (text.length > 1000) throw new AdminInputError('ข้อความยาวเกินไป (ไม่เกิน 1,000 ตัวอักษร)');
  ok(await db().from('applicants').update({ admin_feedback: text }).eq('id', id), 'set feedback');
  await audit(admin, text ? 'ฝากข้อความถึงผู้สมัคร' : 'ลบข้อความถึงผู้สมัคร', row, text || '-', 'admin_feedback');
  if (sendLine && text) {
    const sent = await pushAndLog(row, 'custom', text, [{ type: 'text', text: `ข้อความจากเจ้าหน้าที่ HR:\n${text}` }], adminDisplayName(admin));
    if (!sent && row.line_user_id) throw new AdminInputError('บันทึกข้อความแล้ว แต่ส่ง LINE ไม่สำเร็จ กรุณาลองใหม่');
  }
  return getApplicantDetail(id);
}

/**
 * ยกเลิกการผูก LINE — ใช้เมื่อผู้สมัครเปลี่ยนบัญชี LINE
 * หลังจากนี้ผู้สมัครเปิดหน้าลงทะเบียนจาก LINE ใหม่ แล้วกรอกเบอร์เดิม ระบบจะผูกบัญชีใหม่ให้
 *
 * เปลี่ยน token ของลิงก์ส่วนตัวด้วย — ไม่งั้น LINE เดิมเปิดลิงก์เก่าแล้วระบบจะผูกกลับไปที่ LINE เดิมทันที
 */
export async function unlinkLine(admin: AdminProfile, id: string) {
  const row = await loadRow(id);
  if (!row.line_user_id) throw new AdminInputError('ผู้สมัครนี้ยังไม่ได้ผูก LINE');
  ok(
    await db()
      .from('applicants')
      .update({ line_user_id: null, access_token: crypto.randomUUID().replace(/-/g, '') })
      .eq('id', id),
    'unlink line',
  );
  await audit(admin, 'ยกเลิกการผูก LINE', row, `LINE เดิม ${row.line_user_id.slice(0, 8)}… (ลิงก์ส่วนตัวเดิมใช้ไม่ได้แล้ว)`, 'line_user_id');
  return getApplicantDetail(id);
}

/** ลิงก์ชั่วคราวสำหรับเปิดไฟล์ (หมดอายุใน 2 นาที) */
export async function fileUrl(fileId: string): Promise<string> {
  const f = ok(
    await db().from('applicant_files').select('storage_path, legacy_url').eq('id', fileId).maybeSingle(),
    'load file',
  ) as { storage_path: string | null; legacy_url: string | null } | null;
  if (!f) throw new AdminInputError('ไม่พบไฟล์');
  if (f.storage_path) {
    const res = await db().storage.from(DOCS_BUCKET).createSignedUrl(f.storage_path, 120);
    if (res.error || !res.data) throw new Error(`sign url: ${res.error?.message}`);
    return res.data.signedUrl;
  }
  if (f.legacy_url) return f.legacy_url;
  throw new AdminInputError('ไฟล์นี้ไม่มีข้อมูล');
}
