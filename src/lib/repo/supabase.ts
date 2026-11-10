import type { SupabaseClient } from '@supabase/supabase-js';
import type { Applicant, DocReview, DocType, FileSlotRef, ReviewStatus } from '@/lib/docs/types';
import type { ActivityLogInput, NotificationLogInput, PendingUpload, Repo, SaveUploadInput } from './types';

export const DOCS_BUCKET = 'applicant-docs';
const DOC_TYPES_TTL_MS = 60_000;

// ต้องเป็น string literal เดียว (ห้ามต่อด้วย +) — supabase-js อ่าน type ของผลลัพธ์จากข้อความนี้
const APPLICANT_COLUMNS =
  'id, code, name, phone, approved, line_user_id, access_token, required_doc_keys, admin_feedback, onboard_notified_at, pdpa_version, pdpa_accepted_at';

interface ApplicantRow {
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
}

function toApplicant(r: ApplicantRow): Applicant {
  return {
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
  };
}

function pdpaColumns(pdpa: { version: string; lineUserId: string | null }) {
  return {
    pdpa_version: pdpa.version,
    pdpa_accepted_at: new Date().toISOString(),
    pdpa_line_user_id: pdpa.lineUserId,
  };
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export function createSupabaseRepo(db: SupabaseClient): Repo {
  // ประเภทเอกสารเปลี่ยนน้อยมาก — จำไว้ในหน่วยความจำของ instance 60 วินาที
  let docTypesCache: { at: number; value: DocType[] } | null = null;

  return {
    async findApplicantByLineId(lineUserId) {
      const res = await db.from('applicants').select(APPLICANT_COLUMNS).eq('line_user_id', lineUserId).maybeSingle();
      const row = check(res, 'findApplicantByLineId') as ApplicantRow | null;
      return row ? toApplicant(row) : null;
    },

    async createApplicantForLine(lineUserId) {
      // upsert กันกรณี LINE ส่ง event ซ้ำพร้อมกัน (line_user_id เป็น unique)
      const res = await db
        .from('applicants')
        .upsert({ line_user_id: lineUserId }, { onConflict: 'line_user_id', ignoreDuplicates: false })
        .select(APPLICANT_COLUMNS)
        .single();
      return toApplicant(check(res, 'createApplicantForLine') as ApplicantRow);
    },

    async findApplicantByToken(token) {
      const res = await db.from('applicants').select(APPLICANT_COLUMNS).eq('access_token', token).maybeSingle();
      const row = check(res, 'findApplicantByToken') as ApplicantRow | null;
      return row ? toApplicant(row) : null;
    },

    async findApplicantsByPhone(phone) {
      const res = await db
        .from('applicants')
        .select(APPLICANT_COLUMNS)
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(5);
      return (check(res, 'findApplicantsByPhone') as ApplicantRow[]).map(toApplicant);
    },

    async createApplicant(input) {
      const res = await db
        .from('applicants')
        .insert({
          name: input.name,
          phone: input.phone,
          line_user_id: input.lineUserId,
          ...pdpaColumns(input.pdpa),
        })
        .select(APPLICANT_COLUMNS)
        .single();
      return toApplicant(check(res, 'createApplicant') as ApplicantRow);
    },

    async updateApplicant(id, patch) {
      const values: Record<string, unknown> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.phone !== undefined) values.phone = patch.phone;
      if (patch.pdpa) Object.assign(values, pdpaColumns(patch.pdpa));

      if (Object.keys(values).length > 0) {
        check(await db.from('applicants').update(values).eq('id', id), 'updateApplicant');
      }
      if (patch.bindLineUserId) {
        // ผูกเฉพาะแถวที่ยังไม่มี LINE — กันเขียนทับบัญชี LINE ของคนอื่น
        check(
          await db.from('applicants').update({ line_user_id: patch.bindLineUserId }).eq('id', id).is('line_user_id', null),
          'bind line_user_id',
        );
      }
      const res = await db.from('applicants').select(APPLICANT_COLUMNS).eq('id', id).single();
      return toApplicant(check(res, 'updateApplicant reload') as ApplicantRow);
    },

    async markCompleted(id, requiredDocKeys) {
      const now = new Date().toISOString();
      check(await db.from('applicants').update({ completed_at: now }).eq('id', id).is('completed_at', null), 'markCompleted');
      if (requiredDocKeys.length > 0) {
        check(
          await db.from('applicants').update({ required_doc_keys: requiredDocKeys }).eq('id', id).is('required_doc_keys', null),
          'markCompleted snapshot',
        );
      }
    },

    async getDocTypes() {
      if (docTypesCache && Date.now() - docTypesCache.at < DOC_TYPES_TTL_MS) return docTypesCache.value;
      const res = await db
        .from('doc_types')
        .select('key, label, description, sort_order, enabled, optional, covers_all, doc_subitems(title, sort_order, optional)')
        .order('sort_order');
      const rows = check(res, 'getDocTypes') as Array<{
        key: string;
        label: string;
        description: string;
        sort_order: number;
        enabled: boolean;
        optional: boolean;
        covers_all: boolean;
        doc_subitems: Array<{ title: string; sort_order: number; optional: boolean }>;
      }>;
      const value: DocType[] = rows.map((r) => ({
        key: r.key,
        label: r.label,
        description: r.description,
        sortOrder: r.sort_order,
        enabled: r.enabled,
        optional: r.optional,
        coversAll: r.covers_all,
        subitems: [...(r.doc_subitems ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ title: s.title, optional: s.optional })),
      }));
      docTypesCache = { at: Date.now(), value };
      return value;
    },

    async getDocState(applicantId) {
      const [filesRes, reviewsRes] = await Promise.all([
        db.from('applicant_files').select('doc_key, subitem_title').eq('applicant_id', applicantId).eq('is_current', true),
        db.from('doc_reviews').select('doc_key, subitem_title, status, reason, reviewed_by, updated_at').eq('applicant_id', applicantId),
      ]);
      const files = (check(filesRes, 'getDocState files') as Array<{ doc_key: string; subitem_title: string }>).map(
        (f): FileSlotRef => ({ docKey: f.doc_key, subitemTitle: f.subitem_title }),
      );
      const reviews = (
        check(reviewsRes, 'getDocState reviews') as Array<{
          doc_key: string;
          subitem_title: string;
          status: ReviewStatus;
          reason: string;
          reviewed_by: string | null;
          updated_at: string | null;
        }>
      ).map(
        (r): DocReview => ({
          docKey: r.doc_key,
          subitemTitle: r.subitem_title,
          status: r.status,
          reason: r.reason,
          reviewedBy: r.reviewed_by,
          updatedAt: r.updated_at,
        }),
      );
      return { files, reviews };
    },

    async setPendingUpload(lineUserId, pending, ttlSeconds) {
      const res = await db.from('line_pending_uploads').upsert({
        line_user_id: lineUserId,
        doc_key: pending.docKey,
        subitem_title: pending.subitemTitle,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      });
      check(res, 'setPendingUpload');
    },

    async getPendingUpload(lineUserId): Promise<PendingUpload | null> {
      const res = await db
        .from('line_pending_uploads')
        .select('doc_key, subitem_title, expires_at')
        .eq('line_user_id', lineUserId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      const row = check(res, 'getPendingUpload') as { doc_key: string; subitem_title: string } | null;
      return row ? { docKey: row.doc_key, subitemTitle: row.subitem_title } : null;
    },

    async clearPendingUpload(lineUserId) {
      check(await db.from('line_pending_uploads').delete().eq('line_user_id', lineUserId), 'clearPendingUpload');
    },

    async saveUploadedFile(input: SaveUploadInput) {
      const { applicant, docKey, subitemTitle, bytes, mimeType, source, replaceExisting = true } = input;
      const ext = EXT[mimeType] ?? 'bin';
      const path = `${applicant.id}/${docKey}/${crypto.randomUUID()}.${ext}`;

      const up = await db.storage.from(DOCS_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: false });
      if (up.error) throw new Error(`upload storage: ${up.error.message}`);

      const inserted = check(
        await db
          .from('applicant_files')
          .insert({
            applicant_id: applicant.id,
            doc_key: docKey,
            subitem_title: subitemTitle,
            storage_path: path,
            mime_type: mimeType,
            size_bytes: bytes.length,
            source,
          })
          .select('id, created_at')
          .single(),
        'insert applicant_files',
      ) as { id: string; created_at: string };

      // ไฟล์ใหม่แทนที่ไฟล์เก่าของช่องเดียวกัน (เหมือนระบบเดิม) — ไฟล์เก่ายังเก็บไว้เป็นประวัติ
      // เงื่อนไข created_at <= ของไฟล์ใหม่ กันกรณีอัปโหลดพร้อมกัน 2 ไฟล์แล้วไฟล์ที่ใหม่กว่าถูกปิดทิ้ง
      if (replaceExisting) {
        check(
          await db
            .from('applicant_files')
            .update({ is_current: false })
            .eq('applicant_id', applicant.id)
            .eq('doc_key', docKey)
            .eq('subitem_title', subitemTitle)
            .eq('is_current', true)
            .neq('id', inserted.id)
            .lte('created_at', inserted.created_at),
          'retire old files',
        );
      }

      const now = new Date().toISOString();
      const reviewRows = [{ applicant_id: applicant.id, doc_key: docKey, subitem_title: '' }];
      if (subitemTitle) reviewRows.push({ applicant_id: applicant.id, doc_key: docKey, subitem_title: subitemTitle });
      check(
        await db.from('doc_reviews').upsert(
          reviewRows.map((r) => ({ ...r, status: 'pending_review', reason: '', reviewed_by: null, updated_at: now })),
        ),
        'set reviews pending',
      );
      check(
        await db.from('applicants').update({ last_uploaded_at: now }).eq('id', applicant.id),
        'touch last_uploaded_at',
      );
    },

    async logActivity(input: ActivityLogInput) {
      const res = await db.from('audit_log').insert({
        kind: 'activity',
        actor: input.actor,
        action: input.action,
        target_id: input.targetId ?? null,
        target_name: input.targetName ?? null,
        detail: input.detail ?? null,
      });
      if (res.error) console.error('[repo] logActivity', res.error.message);
    },

    async logNotification(input: NotificationLogInput) {
      const res = await db.from('notification_log').insert({
        type: input.type,
        applicant_id: input.applicant.id,
        applicant_name: input.applicant.name,
        phone: input.applicant.phone,
        sent_by: input.sentBy ?? 'System',
        status: input.status,
        message_preview: input.messagePreview.slice(0, 200),
        error: input.error ?? null,
      });
      if (res.error) console.error('[repo] logNotification', res.error.message);
    },
  };
}
