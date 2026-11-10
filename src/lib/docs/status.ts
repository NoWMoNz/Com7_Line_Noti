/**
 * คำนวณสถานะเอกสารของผู้สมัคร — ใช้ร่วมกันทุกที่ (LINE, หน้าผู้สมัคร, หน้าแอดมิน, แจ้งเตือน)
 *
 * ระบบเดิมมี logic นี้ซ้ำอยู่หลายไฟล์ (isDocSatisfiedForLine_, buildApplicantDto_,
 * getActionableMissingDocs_, isDocMissing_, หน้า Upload) และผลไม่ตรงกันในบางกรณี
 * ไฟล์นี้รวมกฎไว้ที่เดียว:
 *
 *  1. แอดมินอนุมัติเอกสารทั้งชิ้น                → ผ่าน
 *  2. เอกสารทั้งชิ้น หรือหัวข้อย่อยใดถูกตีกลับ     → ต้องแก้ไข (ไม่ผ่าน)
 *  3. มีไฟล์รวม (all-in-one) ที่ไม่ถูกตีกลับ        → ผ่าน (ครอบคลุม)
 *  4. มีหัวข้อย่อย: ทุกหัวข้อที่ไม่ใช่ "ถ้ามี" ต้องอนุมัติแล้วหรือมีไฟล์ → ส่งครบ (รอตรวจ)
 *  5. ไม่มีหัวข้อย่อย: มีไฟล์อย่างน้อย 1 ไฟล์       → ส่งครบ (รอตรวจ)
 *  6. นอกนั้น                                    → ยังไม่ได้ส่ง
 *
 * "ครบสมบูรณ์" (complete) = ทุกเอกสารบังคับถูกแอดมินอนุมัติแล้ว
 * "ส่งครบ" (allSatisfied) = ไม่มีเอกสารที่ยังไม่ส่งหรือต้องแก้ไข (อาจยังรอตรวจ)
 */
import type { DocReview, DocType, FileSlotRef } from './types';

export type DocState = 'approved' | 'covered' | 'submitted' | 'rejected' | 'partial' | 'missing';
export type SubitemState = 'approved' | 'submitted' | 'rejected' | 'missing';

export interface SubitemStatus {
  title: string;
  optional: boolean;
  state: SubitemState;
  reason: string;
}

export interface DocStatus {
  doc: DocType;
  state: DocState;
  /** ผ่านเงื่อนไขการส่งแล้ว (approved / covered / submitted) */
  satisfied: boolean;
  reason: string;
  hasOwnFile: boolean;
  subitems: SubitemStatus[];
  /** จำนวนหัวข้อย่อยบังคับที่ผ่านแล้ว / ทั้งหมด */
  subDone: number;
  subRequired: number;
}

export interface ApplicantDocSummary {
  /** เอกสารที่ต้องส่ง (ไม่รวมไฟล์รวม all-in-one และเอกสารไม่บังคับ) */
  docs: DocStatus[];
  hasAllInOne: boolean;
  total: number;
  satisfiedCount: number;
  /** ยังไม่ส่ง / ส่งไม่ครบ / ต้องแก้ไข — เรียงตามลำดับเอกสาร */
  actionable: DocStatus[];
  allSatisfied: boolean;
  complete: boolean;
}

const slotKey = (docKey: string, subitemTitle: string) => `${docKey}\u0000${subitemTitle}`;

/**
 * ชุดเอกสารที่ผู้สมัครคนนี้ต้องส่ง
 * - มี snapshot → ใช้ตาม snapshot (แม้ภายหลังเอกสารนั้นจะถูกปิด) + ไฟล์รวมที่เปิดใช้งาน
 * - ไม่มี → เอกสารที่เปิดใช้งานปัจจุบัน
 */
export function requiredDocsFor(requiredDocKeys: string[] | null, allDocs: DocType[]): DocType[] {
  const sorted = [...allDocs].sort((a, b) => a.sortOrder - b.sortOrder);
  if (requiredDocKeys && requiredDocKeys.length > 0) {
    const wanted = new Set(requiredDocKeys);
    const picked = sorted.filter((d) => wanted.has(d.key) || (d.coversAll && d.enabled));
    if (picked.some((d) => !d.coversAll)) return picked;
  }
  return sorted.filter((d) => d.enabled);
}

export function summarizeApplicantDocs(
  docs: DocType[],
  files: FileSlotRef[],
  reviews: DocReview[],
): ApplicantDocSummary {
  const fileSlots = new Set(files.map((f) => slotKey(f.docKey, f.subitemTitle)));
  const docsWithFile = new Set(files.map((f) => f.docKey));
  const reviewBySlot = new Map(reviews.map((r) => [slotKey(r.docKey, r.subitemTitle), r]));
  const reviewOf = (docKey: string, sub = '') => reviewBySlot.get(slotKey(docKey, sub));

  const allInOneDocs = docs.filter((d) => d.coversAll);
  const hasAllInOne = allInOneDocs.some(
    (d) => docsWithFile.has(d.key) && reviewOf(d.key)?.status !== 'rejected',
  );

  const statuses: DocStatus[] = docs
    .filter((d) => !d.coversAll && !d.optional)
    .map((doc) => {
      const parent = reviewOf(doc.key);
      const hasOwnFile = docsWithFile.has(doc.key);

      const subitems: SubitemStatus[] = doc.subitems.map((s) => {
        const rv = reviewOf(doc.key, s.title);
        let state: SubitemState = 'missing';
        if (rv?.status === 'rejected') state = 'rejected';
        else if (rv?.status === 'approved' || parent?.status === 'approved') state = 'approved';
        else if (fileSlots.has(slotKey(doc.key, s.title))) state = 'submitted';
        return { title: s.title, optional: s.optional, state, reason: rv?.reason ?? '' };
      });
      const required = subitems.filter((s) => !s.optional);
      const subDone = required.filter((s) => s.state === 'approved' || s.state === 'submitted').length;
      const rejectedSub = subitems.find((s) => s.state === 'rejected');

      let state: DocState;
      let reason = '';
      if (parent?.status === 'approved' && !rejectedSub) {
        state = 'approved';
      } else if (parent?.status === 'rejected') {
        state = 'rejected';
        reason = parent.reason;
      } else if (rejectedSub) {
        state = 'rejected';
        reason = rejectedSub.reason;
      } else if (hasAllInOne) {
        state = 'covered';
      } else if (doc.subitems.length > 0) {
        if (subDone === required.length) state = 'submitted';
        else state = subDone > 0 || hasOwnFile ? 'partial' : 'missing';
      } else {
        state = hasOwnFile ? 'submitted' : 'missing';
      }

      return {
        doc,
        state,
        satisfied: state === 'approved' || state === 'covered' || state === 'submitted',
        reason,
        hasOwnFile,
        subitems,
        subDone,
        subRequired: required.length,
      };
    });

  const actionable = statuses.filter((s) => !s.satisfied);
  return {
    docs: statuses,
    hasAllInOne,
    total: statuses.length,
    satisfiedCount: statuses.length - actionable.length,
    actionable,
    allSatisfied: actionable.length === 0,
    complete: statuses.length > 0 && statuses.every((s) => s.state === 'approved'),
  };
}
