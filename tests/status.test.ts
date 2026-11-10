import { describe, expect, it } from 'vitest';
import { requiredDocsFor, summarizeApplicantDocs } from '@/lib/docs/status';
import type { DocReview } from '@/lib/docs/types';
import { DOCS } from './fixtures';

const file = (docKey: string, subitemTitle = '') => ({ docKey, subitemTitle });
const review = (docKey: string, status: DocReview['status'], subitemTitle = '', reason = ''): DocReview => ({
  docKey,
  subitemTitle,
  status,
  reason,
  reviewedBy: null,
  updatedAt: null,
});
const stateOf = (s: ReturnType<typeof summarizeApplicantDocs>, key: string) => s.docs.find((d) => d.doc.key === key)!.state;

describe('summarizeApplicantDocs', () => {
  it('ยังไม่ส่งอะไรเลย → ทุกข้อ missing, ไม่นับไฟล์รวม', () => {
    const s = summarizeApplicantDocs(DOCS, [], []);
    expect(s.total).toBe(3);
    expect(s.satisfiedCount).toBe(0);
    expect(s.actionable.map((d) => d.doc.key)).toEqual(['doc1_application_set', 'doc9_health_receipt', 'doc11_guarantor_copy']);
    expect(s.allSatisfied).toBe(false);
  });

  it('เอกสารหลายหน้า: ส่งบางหน้า = partial, ครบทุกหน้า = submitted', () => {
    const partial = summarizeApplicantDocs(DOCS, [file('doc1_application_set', 'ใบสมัครหน้าที่ 1')], []);
    expect(stateOf(partial, 'doc1_application_set')).toBe('partial');

    const full = summarizeApplicantDocs(
      DOCS,
      ['ใบสมัครหน้าที่ 1', 'ใบสมัครหน้าที่ 2', 'ใบสมัครหน้าที่ 3'].map((t) => file('doc1_application_set', t)),
      [],
    );
    expect(stateOf(full, 'doc1_application_set')).toBe('submitted');
    expect(full.docs[0].subDone).toBe(3);
  });

  it('หัวข้อ "ถ้ามี" ไม่ต้องส่งก็ถือว่าครบ', () => {
    const s = summarizeApplicantDocs(DOCS, [file('doc11_guarantor_copy', 'สำเนาบัตรประชาชน')], []);
    expect(stateOf(s, 'doc11_guarantor_copy')).toBe('submitted');
  });

  it('ไฟล์รวมครอบคลุมทุกเอกสาร — ยกเว้นเมื่อไฟล์รวมถูกตีกลับ', () => {
    const covered = summarizeApplicantDocs(DOCS, [file('doc0_all_in_one')], []);
    expect(covered.allSatisfied).toBe(true);
    expect(stateOf(covered, 'doc9_health_receipt')).toBe('covered');
    expect(covered.complete).toBe(false); // ครอบคลุม ≠ อนุมัติ

    const rejected = summarizeApplicantDocs(DOCS, [file('doc0_all_in_one')], [review('doc0_all_in_one', 'rejected')]);
    expect(rejected.allSatisfied).toBe(false);
  });

  it('แอดมินอนุมัติ = ผ่าน แม้ไม่มีไฟล์ / ตีกลับ = ต้องแก้ แม้มีไฟล์', () => {
    const s = summarizeApplicantDocs(
      DOCS,
      [file('doc9_health_receipt')],
      [review('doc1_application_set', 'approved'), review('doc9_health_receipt', 'rejected', '', 'ภาพไม่ชัด')],
    );
    expect(stateOf(s, 'doc1_application_set')).toBe('approved');
    const health = s.docs.find((d) => d.doc.key === 'doc9_health_receipt')!;
    expect(health.state).toBe('rejected');
    expect(health.reason).toBe('ภาพไม่ชัด');
  });

  it('หัวข้อย่อยถูกตีกลับ → ทั้งเอกสารต้องแก้ไข แม้ตัวเอกสารเคยอนุมัติ', () => {
    const s = summarizeApplicantDocs(DOCS, [], [
      review('doc1_application_set', 'approved'),
      review('doc1_application_set', 'rejected', 'ใบสมัครหน้าที่ 2', 'ไม่ได้เซ็น'),
    ]);
    const d = s.docs.find((x) => x.doc.key === 'doc1_application_set')!;
    expect(d.state).toBe('rejected');
    expect(d.reason).toBe('ไม่ได้เซ็น');
  });

  it('complete เมื่อทุกเอกสารบังคับถูกอนุมัติ', () => {
    const s = summarizeApplicantDocs(DOCS, [], [
      review('doc1_application_set', 'approved'),
      review('doc9_health_receipt', 'approved'),
      review('doc11_guarantor_copy', 'approved'),
    ]);
    expect(s.complete).toBe(true);
    expect(s.allSatisfied).toBe(true);
  });
});

describe('requiredDocsFor', () => {
  it('ไม่มี snapshot → เอกสารที่เปิดอยู่', () => {
    const docs = [...DOCS, { ...DOCS[2], key: 'docX', enabled: false, sortOrder: 9 }];
    expect(requiredDocsFor(null, docs).map((d) => d.key)).not.toContain('docX');
  });

  it('มี snapshot → ใช้ตาม snapshot (แม้เอกสารถูกปิดภายหลัง) + ไฟล์รวม', () => {
    const docs = DOCS.map((d) => (d.key === 'doc9_health_receipt' ? { ...d, enabled: false } : d));
    expect(requiredDocsFor(['doc9_health_receipt'], docs).map((d) => d.key)).toEqual(['doc0_all_in_one', 'doc9_health_receipt']);
  });
});
