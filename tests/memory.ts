/** ฐานข้อมูลและ LINE จำลองในหน่วยความจำ — ใช้ร่วมกันใน test ของ webhook และหน้าผู้สมัคร */
import type { Applicant, DocReview, DocType, FileSlotRef } from '@/lib/docs/types';
import type { LineApi, LineMessage } from '@/lib/line/types';
import type { PendingUpload, Repo, SaveUploadInput } from '@/lib/repo/types';
import { DOCS } from './fixtures';

export function makeApplicant(n: number, extra: Partial<Applicant> = {}): Applicant {
  return {
    id: `app-${n}`,
    code: `APP_${n}`,
    name: '',
    phone: null,
    approved: false,
    lineUserId: null,
    accessToken: `tok${n}`,
    requiredDocKeys: null,
    adminFeedback: '',
    onboardNotified: false,
    pdpaVersion: null,
    pdpaAcceptedAt: null,
    ...extra,
  };
}

export function createMemoryRepo(docs: DocType[] = DOCS) {
  const applicants: Applicant[] = [];
  const files: Array<FileSlotRef & { applicantId: string; current: boolean; mimeType: string; size: number }> = [];
  const reviews: Array<DocReview & { applicantId: string }> = [];
  const pending = new Map<string, PendingUpload>();
  const activity: string[] = [];
  const notifications: string[] = [];

  const add = (extra: Partial<Applicant> = {}) => {
    const a = makeApplicant(applicants.length + 1, extra);
    applicants.push(a);
    return a;
  };
  const byId = (id: string) => {
    const a = applicants.find((x) => x.id === id);
    if (!a) throw new Error(`no applicant ${id}`);
    return a;
  };

  const repo: Repo = {
    async findApplicantByLineId(id) {
      return applicants.find((a) => a.lineUserId === id) ?? null;
    },
    async createApplicantForLine(id) {
      return add({ lineUserId: id });
    },
    async findApplicantByToken(token) {
      return applicants.find((a) => a.accessToken === token) ?? null;
    },
    async findApplicantsByPhone(phone) {
      return applicants.filter((a) => a.phone === phone);
    },
    async createApplicant(input) {
      if (input.lineUserId && applicants.some((a) => a.lineUserId === input.lineUserId)) {
        throw new Error('duplicate line_user_id');
      }
      return add({
        name: input.name,
        phone: input.phone,
        lineUserId: input.lineUserId,
        pdpaVersion: input.pdpa.version,
        pdpaAcceptedAt: new Date().toISOString(),
      });
    },
    async updateApplicant(id, patch) {
      const a = byId(id);
      if (patch.name !== undefined) a.name = patch.name;
      if (patch.phone !== undefined) a.phone = patch.phone;
      if (patch.pdpa) {
        a.pdpaVersion = patch.pdpa.version;
        a.pdpaAcceptedAt = new Date().toISOString();
      }
      if (patch.bindLineUserId && !a.lineUserId) a.lineUserId = patch.bindLineUserId;
      return { ...a };
    },
    async getDocTypes() {
      return docs;
    },
    async getDocState(applicantId) {
      return {
        files: files.filter((f) => f.applicantId === applicantId && f.current),
        reviews: reviews.filter((r) => r.applicantId === applicantId),
      };
    },
    async setPendingUpload(uid, p) {
      pending.set(uid, p);
    },
    async getPendingUpload(uid) {
      return pending.get(uid) ?? null;
    },
    async clearPendingUpload(uid) {
      pending.delete(uid);
    },
    async saveUploadedFile(input: SaveUploadInput) {
      const { applicant, docKey, subitemTitle, replaceExisting = true } = input;
      if (replaceExisting) {
        files
          .filter((f) => f.applicantId === applicant.id && f.docKey === docKey && f.subitemTitle === subitemTitle)
          .forEach((f) => (f.current = false));
      }
      files.push({
        applicantId: applicant.id,
        docKey,
        subitemTitle,
        current: true,
        mimeType: input.mimeType,
        size: input.bytes.length,
      });
      for (const sub of subitemTitle ? ['', subitemTitle] : ['']) {
        const i = reviews.findIndex((r) => r.applicantId === applicant.id && r.docKey === docKey && r.subitemTitle === sub);
        if (i !== -1) reviews.splice(i, 1);
        reviews.push({ applicantId: applicant.id, docKey, subitemTitle: sub, status: 'pending_review', reason: '', reviewedBy: null, updatedAt: null });
      }
    },
    async logActivity(i) {
      activity.push(i.action);
    },
    async logNotification(i) {
      notifications.push(i.type);
    },
  };

  /** ตั้งผลตรวจแบบแอดมิน */
  const review = (applicantId: string, docKey: string, subitemTitle: string, status: DocReview['status'], reason = '') => {
    const i = reviews.findIndex((r) => r.applicantId === applicantId && r.docKey === docKey && r.subitemTitle === subitemTitle);
    if (i !== -1) reviews.splice(i, 1);
    reviews.push({ applicantId, docKey, subitemTitle, status, reason, reviewedBy: 'HR', updatedAt: null });
  };

  return { repo, applicants, files, reviews, pending, activity, notifications, add, review };
}

export function createFakeLine(contentType = 'image/jpeg', size = 1000) {
  const replies: LineMessage[][] = [];
  const pushes: Array<{ to: string; messages: LineMessage[] }> = [];
  const line: LineApi = {
    async reply(_t, m) {
      replies.push(m);
    },
    async push(to, m) {
      pushes.push({ to, messages: m });
      return true;
    },
    async getContent() {
      return { bytes: new Uint8Array(size), contentType };
    },
  };
  return { line, replies, pushes };
}
