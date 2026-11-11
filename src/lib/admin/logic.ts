/**
 * กฎของฝั่งแอดมินที่ไม่ต้องใช้ฐานข้อมูล — แยกไว้ให้ทดสอบได้
 * (ย้ายมาจาก admin_setDocReview / syncCompletedAt_ / notifyRejectedDoc_ / notifyApprovedDoc_ ของระบบเดิม)
 */
import type { ApplicantDocSummary } from '@/lib/docs/status';
import type { Applicant, DocReview, DocScope, DocType } from '@/lib/docs/types';
import { buildNotifyFlex } from '@/lib/line/flex';
import type { FlexBubble } from '@/lib/line/types';
import type { ApplicantStage, ReviewItemInput } from './types';

/**
 * ผลตรวจที่ยังรอ HR จริง — ไม่นับหัวข้อย่อยที่ค้าง "รอตรวจ" ใต้เอกสารที่อนุมัติทั้งชิ้นแล้ว
 * (ข้อมูลจากระบบเดิมมีแบบนี้ หน้าตรวจก็แสดงเอกสารนั้นว่าอนุมัติแล้ว)
 */
export function pendingReviews<T extends Pick<DocReview, 'docKey' | 'subitemTitle' | 'status'>>(reviews: T[]): T[] {
  const approvedDocs = new Set(reviews.filter((r) => r.subitemTitle === '' && r.status === 'approved').map((r) => r.docKey));
  return reviews.filter((r) => r.status === 'pending_review' && !(r.subitemTitle !== '' && approvedDocs.has(r.docKey)));
}

export function applicantStage(applicant: Applicant, summary: ApplicantDocSummary | null, reviews: DocReview[]): ApplicantStage {
  if (applicant.closedStatus) return applicant.closedStatus;
  if (!applicant.name.trim() || !(applicant.phone ?? '').trim()) return 'no_profile';
  if (!applicant.approved) return 'pending_approval';
  if (applicant.onboardNotified) return 'onboarded';
  if (!summary) return 'missing';
  if (summary.complete) return applicant.docScope === 'initial' ? 'initial_complete' : 'complete';
  if (summary.docs.some((d) => d.state === 'rejected')) return 'rejected';
  if (pendingReviews(reviews).length > 0 || summary.allSatisfied) return 'review';
  return 'missing';
}

/** ช่องที่รอ HR ตรวจ — นับเป็นรายการ (เอกสารที่มีหัวข้อย่อยนับตามหัวข้อย่อย) */
export function countPendingReview(reviews: DocReview[], docs: DocType[]): number {
  const withSubs = new Set(docs.filter((d) => d.subitems.length > 0).map((d) => d.key));
  return pendingReviews(reviews).filter((r) => (withSubs.has(r.docKey) ? r.subitemTitle !== '' : r.subitemTitle === '')).length;
}

export class ReviewInputError extends Error {}

/** ตรวจรายการตรวจเอกสารจากหน้าเว็บ — คืนรายการที่ทำความสะอาดแล้ว */
export function validateReviewItems(items: unknown, allDocs: DocType[]): ReviewItemInput[] {
  if (!Array.isArray(items) || items.length === 0) throw new ReviewInputError('ไม่มีรายการที่จะบันทึก');
  if (items.length > 50) throw new ReviewInputError('บันทึกได้ครั้งละไม่เกิน 50 รายการ');
  return items.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const docKey = String(it.docKey ?? '');
    const subitemTitle = String(it.subitemTitle ?? '');
    const status = String(it.status ?? '');
    const reason = String(it.reason ?? '').trim();
    const doc = allDocs.find((d) => d.key === docKey);
    if (!doc) throw new ReviewInputError(`ไม่พบประเภทเอกสาร ${docKey}`);
    if (subitemTitle && !doc.subitems.some((s) => s.title === subitemTitle)) {
      throw new ReviewInputError(`ไม่พบหัวข้อ "${subitemTitle}" ใน ${doc.label}`);
    }
    if (status !== 'approved' && status !== 'rejected' && status !== 'pending_review') {
      throw new ReviewInputError('สถานะไม่ถูกต้อง');
    }
    if (status === 'rejected' && !reason) throw new ReviewInputError('กรุณาระบุเหตุผลเมื่อไม่อนุมัติ');
    if (reason.length > 500) throw new ReviewInputError('เหตุผลยาวเกินไป (ไม่เกิน 500 ตัวอักษร)');
    return { docKey, subitemTitle, status, reason: status === 'rejected' ? reason : '' };
  });
}

/**
 * ต้องทำอะไรกับ completed_at / snapshot (syncCompletedAt_ ของระบบเดิม)
 *
 * completed_at = "ส่งครบ" ตามความหมายของระบบเดิม (ทุกเอกสารบังคับมีไฟล์/อนุมัติ และไม่มีที่ถูกตีกลับ
 * — รอตรวจก็นับ) ไม่ใช่ "อนุมัติครบ" ข้อมูลที่ย้ายมาใช้ความหมายนี้ จึงต้องคงไว้
 *
 * - ครบครั้งแรก → ตั้งวันที่ + ล็อกชุดเอกสาร (เพิ่มเอกสารทีหลังจะไม่กระทบคนนี้)
 * - ไม่ครบแล้ว (เพิ่งโดนตีกลับ) → ล้างวันที่ แต่คง snapshot ไว้
 * - ส่งเฉพาะเบื้องต้น → ไม่ล็อก snapshot (ไม่งั้นเปลี่ยนเป็น "ส่งทั้งหมด" ทีหลังจะเห็นแค่ชุดเบื้องต้น)
 */
export function completionChange(
  complete: boolean,
  completedAt: string | null,
  requiredDocKeys: string[] | null,
  currentRequired: DocType[],
  scope: DocScope = 'all',
): { completedAt?: string | null; requiredDocKeys?: string[] } {
  if (complete && !completedAt) {
    const lock = !requiredDocKeys?.length && scope === 'all';
    return {
      completedAt: new Date().toISOString(),
      ...(lock ? { requiredDocKeys: currentRequired.filter((d) => !d.coversAll).map((d) => d.key) } : {}),
    };
  }
  if (!complete && completedAt) return { completedAt: null };
  return {};
}

/** "1. ใบสมัคร" → "ใบสมัคร" (เลขใช้จัดลำดับเท่านั้น ไม่โชว์ในแชท) */
export const stripDocNumber = (label: string) => label.replace(/^\s*\d+\s*\.\s*/, '').trim();

function itemLabel(item: ReviewItemInput, allDocs: DocType[]): string {
  const doc = allDocs.find((d) => d.key === item.docKey);
  const base = stripDocNumber(doc?.label ?? item.docKey);
  return item.subitemTitle ? `${base} - ${item.subitemTitle}` : base;
}

/**
 * ข้อความ LINE หลัง HR กดบันทึกผลตรวจ — ส่งเฉพาะเรื่องที่ผู้สมัครต้องรู้/ต้องทำ:
 *  - มีรายการไม่ผ่าน → 1 ข้อความรวมทุกรายการ + เหตุผล + ปุ่มเปิดหน้าส่งเอกสารที่เอกสารแรกที่ต้องแก้
 *  - อนุมัติครบทุกรายการ (ครั้งแรก) → 1 ข้อความแจ้งว่าครบแล้ว
 *  - ผ่านบางรายการ → ไม่แจ้ง (ระบบเดิมส่ง "เอกสารผ่าน" ทุกครั้งที่กด ผู้สมัครได้ข้อความรัวๆ)
 */
export function buildReviewMessages(opts: {
  applicantName: string;
  items: ReviewItemInput[];
  allDocs: DocType[];
  becameComplete: boolean;
  /** ผู้สมัครส่งเฉพาะเอกสารเบื้องต้น — ข้อความ "ครบ" บอกว่าเป็นชุดเบื้องต้น */
  initialOnly?: boolean;
  /** ลิงก์เปิดหน้าส่งเอกสาร (docKey = เปิดเอกสารนั้นเลย) */
  linkFor: (docKey?: string) => string;
  logoUrl: string | null;
}): Array<{ type: 'rejected' | 'all_approved'; altText: string; bubble: FlexBubble }> {
  const { applicantName, items, allDocs, logoUrl } = opts;
  const out: Array<{ type: 'rejected' | 'all_approved'; altText: string; bubble: FlexBubble }> = [];
  const rejected = items.filter((i) => i.status === 'rejected');

  if (rejected.length > 0) {
    const labels = rejected.map((i) => itemLabel(i, allDocs));
    const reasons =
      rejected.length === 1 ? rejected[0].reason : rejected.map((i, n) => `${labels[n]}: ${i.reason}`).join('\n');
    out.push({
      type: 'rejected',
      altText: `เอกสารของคุณ${applicantName} ต้องแก้ไข: ${labels.join(', ')}`.slice(0, 400),
      bubble: buildNotifyFlex({
        tone: 'danger',
        title: 'เอกสารต้องแก้ไข',
        subtitle: 'กรุณาแนบไฟล์ใหม่',
        greeting: labels.length === 1 ? labels[0] : `เอกสารที่ต้องแก้ไข ${labels.length} รายการ`,
        list: labels.length > 1 ? { title: 'รายการที่ต้องแก้ไข', items: labels } : undefined,
        note: { label: 'เหตุผลจาก HR', text: reasons, tone: 'danger' },
        button: { label: 'แนบไฟล์ใหม่', uri: opts.linkFor(rejected[0].docKey) },
        logoUrl,
      }),
    });
  } else if (opts.becameComplete && opts.initialOnly) {
    out.push({
      type: 'all_approved',
      altText: `เอกสารเบื้องต้นของคุณ${applicantName} ผ่านการตรวจสอบครบแล้ว`,
      bubble: buildNotifyFlex({
        tone: 'success',
        title: 'เอกสารเบื้องต้นผ่านครบ',
        subtitle: 'อนุมัติโดย HR',
        greeting: applicantName ? `คุณ${applicantName}` : 'สวัสดีค่ะ',
        note: { label: 'ขั้นตอนถัดไป', text: 'เจ้าหน้าที่จะติดต่อกลับเพื่อแจ้งขั้นตอนถัดไปทางแชทนี้', tone: 'success' },
        logoUrl,
      }),
    });
  } else if (opts.becameComplete) {
    out.push({
      type: 'all_approved',
      altText: `เอกสารของคุณ${applicantName} ผ่านการตรวจสอบครบทุกรายการแล้ว`,
      bubble: buildNotifyFlex({
        tone: 'success',
        title: 'เอกสารผ่านครบทุกรายการ',
        subtitle: 'อนุมัติโดย HR',
        greeting: applicantName ? `คุณ${applicantName}` : 'สวัสดีค่ะ',
        note: { label: 'ขั้นตอนถัดไป', text: 'เจ้าหน้าที่จะแจ้งวันเริ่มงานและรายละเอียดทางแชทนี้อีกครั้ง', tone: 'success' },
        logoUrl,
      }),
    });
  }
  return out;
}

export function buildApprovalMessage(applicantName: string, link: string, logoUrl: string | null) {
  return {
    altText: `เจ้าหน้าที่อนุมัติให้คุณ${applicantName} เริ่มส่งเอกสารได้แล้ว`,
    bubble: buildNotifyFlex({
      tone: 'success',
      title: 'อนุมัติเรียบร้อยแล้ว',
      greeting: `คุณ${applicantName} ได้รับการอนุมัติแล้ว\nเริ่มส่งเอกสารได้ทันที`,
      note: {
        label: 'ขั้นตอนถัดไป',
        text: 'กดปุ่มด้านล่างเพื่อเริ่มแนบเอกสารตามรายการที่กำหนด สามารถแนบทีละรายการได้ตามสะดวก',
        tone: 'success',
      },
      button: { label: 'เริ่มแนบเอกสาร', uri: link },
      logoUrl,
    }),
  };
}

/** HR เปลี่ยนจาก "ส่งเบื้องต้น" เป็น "ส่งทั้งหมด" → แจ้งให้ส่งเอกสารที่เหลือ */
export function buildMoreDocsMessage(applicantName: string, link: string, logoUrl: string | null) {
  return {
    altText: `คุณ${applicantName} กรุณาส่งเอกสารเพิ่มเติมให้ครบทุกรายการ`,
    bubble: buildNotifyFlex({
      tone: 'success',
      title: 'กรุณาส่งเอกสารเพิ่มเติม',
      greeting: `คุณ${applicantName}
ผ่านขั้นตอนเบื้องต้นแล้ว`,
      note: {
        label: 'ขั้นตอนถัดไป',
        text: 'กดปุ่มด้านล่างเพื่อแนบเอกสารที่เหลือให้ครบทุกรายการ',
        tone: 'success',
      },
      button: { label: 'แนบเอกสารเพิ่มเติม', uri: link },
      logoUrl,
    }),
  };
}
