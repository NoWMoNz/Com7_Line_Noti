/**
 * กฎของฝั่งแอดมินที่ไม่ต้องใช้ฐานข้อมูล — แยกไว้ให้ทดสอบได้
 * (ย้ายมาจาก admin_setDocReview / syncCompletedAt_ / notifyRejectedDoc_ / notifyApprovedDoc_ ของระบบเดิม)
 */
import type { ApplicantDocSummary } from '@/lib/docs/status';
import type { Applicant, DocReview, DocType } from '@/lib/docs/types';
import { buildNotifyFlex } from '@/lib/line/flex';
import type { FlexBubble } from '@/lib/line/types';
import type { ApplicantStage, ReviewItemInput } from './types';

export function applicantStage(applicant: Applicant, summary: ApplicantDocSummary | null, reviews: DocReview[]): ApplicantStage {
  if (!applicant.name.trim() || !(applicant.phone ?? '').trim()) return 'no_profile';
  if (!applicant.approved) return 'pending_approval';
  if (applicant.onboardNotified) return 'onboarded';
  if (!summary) return 'missing';
  if (summary.complete) return 'complete';
  if (summary.docs.some((d) => d.state === 'rejected')) return 'rejected';
  if (reviews.some((r) => r.status === 'pending_review') || summary.allSatisfied) return 'review';
  return 'missing';
}

/** ช่องที่รอ HR ตรวจ — นับเป็นรายการ (เอกสารที่มีหัวข้อย่อยนับตามหัวข้อย่อย) */
export function countPendingReview(reviews: DocReview[], docs: DocType[]): number {
  const withSubs = new Set(docs.filter((d) => d.subitems.length > 0).map((d) => d.key));
  return reviews.filter(
    (r) => r.status === 'pending_review' && (withSubs.has(r.docKey) ? r.subitemTitle !== '' : r.subitemTitle === ''),
  ).length;
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
 * ต้องทำอะไรกับ completed_at / snapshot หลังตรวจเอกสาร (syncCompletedAt_ ของระบบเดิม)
 * - ครบครั้งแรก → ตั้งวันที่ + ล็อกชุดเอกสาร (เพิ่มเอกสารทีหลังจะไม่กระทบคนนี้)
 * - ไม่ครบแล้ว (เพิ่งโดนตีกลับ) → ล้างวันที่ แต่คง snapshot ไว้
 */
export function completionChange(
  complete: boolean,
  completedAt: string | null,
  requiredDocKeys: string[] | null,
  currentRequired: DocType[],
): { completedAt?: string | null; requiredDocKeys?: string[] } {
  if (complete && !completedAt) {
    return {
      completedAt: new Date().toISOString(),
      ...(requiredDocKeys?.length ? {} : { requiredDocKeys: currentRequired.filter((d) => !d.coversAll).map((d) => d.key) }),
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

/** ข้อความ LINE หลังตรวจเอกสาร: ไม่ผ่าน 1 ข้อความ + ผ่าน 1 ข้อความ (รวมทุกรายการในครั้งเดียว) */
export function buildReviewMessages(
  applicantName: string,
  items: ReviewItemInput[],
  allDocs: DocType[],
  logoUrl: string | null,
): Array<{ type: 'rejected' | 'approved'; altText: string; bubble: FlexBubble }> {
  const out: Array<{ type: 'rejected' | 'approved'; altText: string; bubble: FlexBubble }> = [];
  const rejected = items.filter((i) => i.status === 'rejected');
  const approved = items.filter((i) => i.status === 'approved');

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
        button: { label: 'แนบไฟล์ใหม่', postback: { data: 'action=open_menu', displayText: 'ต้องการแนบไฟล์ใหม่' } },
        logoUrl,
      }),
    });
  }
  if (approved.length > 0) {
    const labels = [...new Set(approved.map((i) => itemLabel(i, allDocs)))];
    out.push({
      type: 'approved',
      altText: `เอกสารของคุณ${applicantName} ผ่านการตรวจสอบ: ${labels.join(', ')}`.slice(0, 400),
      bubble: buildNotifyFlex({
        tone: 'success',
        title: 'เอกสารผ่านการตรวจสอบ',
        subtitle: 'อนุมัติโดย HR',
        greeting: applicantName ? `คุณ${applicantName}` : 'สวัสดีค่ะ',
        list: { title: 'รายการที่ผ่าน', items: labels },
        note:
          labels.length > 1
            ? { label: 'ข้อมูลเพิ่มเติม', text: 'หากยังมีรายการอื่นที่รอดำเนินการ กรุณาดำเนินการต่อในระบบ', tone: 'success' }
            : undefined,
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
