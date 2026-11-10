import 'server-only';
/**
 * งานของหน้าแอดมิน: รายชื่อ, รายละเอียด, อนุมัติ, ตรวจเอกสาร, ข้อความถึงผู้สมัคร, ยกเลิกการผูก LINE
 * ทุกฟังก์ชันต้องเรียกหลัง requireAdmin() แล้วเท่านั้น
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { requiredDocsFor, summarizeApplicantDocs } from '@/lib/docs/status';
import type { Applicant, DocReview, FileSlotRef, ReviewStatus } from '@/lib/docs/types';
import { serverEnv } from '@/lib/env';
import { createLineClient } from '@/lib/line/client';
import { DEFAULT_LOGO_URL } from '@/lib/line/flex';
import { buildPersonalLink } from '@/lib/line/handler';
import type { LineMessage } from '@/lib/line/types';
import { createSupabaseRepo, DOCS_BUCKET } from '@/lib/repo/supabase';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { adminDisplayName } from './auth';
import { selectForApplicants } from './fetch-all';
import {
  applicantStage,
  buildApprovalMessage,
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
  FileView,
  ReviewView,
} from './types';

export class AdminInputError extends Error {}

const PAGE_SIZE = 50;
const COLS =
  'id, code, name, phone, approved, line_user_id, access_token, required_doc_keys, admin_feedback, onboard_notified_at, pdpa_version, pdpa_accepted_at, created_at, last_uploaded_at, completed_at';

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

export async function listApplicants(opts: { q: string; filter: ApplicantListFilter; page: number }): Promise<ApplicantListResult> {
  const page = Math.max(1, Math.floor(opts.page) || 1);
  let query = db()
    .from('applicants')
    .select(COLS, { count: 'exact' })
    .order('last_uploaded_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (opts.filter === 'pending_approval') query = query.eq('approved', false);
  if (opts.filter === 'approved') query = query.eq('approved', true);
  // ตัดอักขระที่มีความหมายในไวยากรณ์ filter ของ PostgREST ออก
  const q = opts.q.replace(/[,()*%\\:]/g, ' ').trim().slice(0, 60);
  if (q) {
    const digits = q.replace(/\D/g, '');
    const parts = [`name.ilike.*${q}*`, `code.ilike.*${q}*`];
    if (digits.length >= 3) parts.push(`phone.ilike.*${digits}*`);
    query = query.or(parts.join(','));
  }

  const res = await query;
  const rows = ok(res, 'list applicants') as Row[];
  const ids = rows.map((r) => r.id);
  const [allDocs, files, reviews] = await Promise.all([
    docTypes(),
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
    const docs = requiredDocsFor(a.requiredDocKeys, allDocs);
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
      satisfied: summary?.satisfiedCount ?? 0,
      total: summary?.total ?? docs.filter((d) => !d.coversAll && !d.optional).length,
      pendingReview: countPendingReview(myReviews, docs),
      createdAt: r.created_at,
      lastUploadedAt: r.last_uploaded_at,
    };
  });
  return { items, total: res.count ?? items.length, page, pageSize: PAGE_SIZE };
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

  const required = requiredDocsFor(a.requiredDocKeys, allDocs);
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
    feedback: row.admin_feedback ?? '',
    pdpaVersion: row.pdpa_version,
    pdpaAcceptedAt: row.pdpa_accepted_at,
    onboardNotified: !!row.onboard_notified_at,
    createdAt: row.created_at,
    lastUploadedAt: row.last_uploaded_at,
    completedAt: row.completed_at,
    satisfied: summary.satisfiedCount,
    total: summary.total,
    docs,
  };
}

// ---------------------------------------------------------------------------
// คำสั่ง

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
    const msg = buildApprovalMessage(row.name, buildPersonalLink(handler, row.access_token), logoUrl);
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
  const required = requiredDocsFor(row.required_doc_keys, allDocs);
  const summary = summarizeApplicantDocs(required, files, reviews);
  // "ส่งครบ" ตามความหมายของระบบเดิม (ดู completionChange)
  const complete = summary.allSatisfied || !!row.onboard_notified_at;
  const change = completionChange(complete, row.completed_at, row.required_doc_keys, required);

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

  if (notify) {
    const { logoUrl } = lineConfig();
    for (const m of buildReviewMessages(row.name, items, allDocs, logoUrl)) {
      await pushAndLog(
        row,
        m.type === 'rejected' ? 'doc_rejected' : 'doc_approved',
        m.altText,
        [{ type: 'flex', altText: m.altText, contents: m.bubble }],
        by,
      );
    }
  }
  return getApplicantDetail(id);
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
