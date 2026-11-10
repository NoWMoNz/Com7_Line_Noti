import { describe, expect, it } from 'vitest';
import {
  applicantStage,
  buildReviewMessages,
  completionChange,
  countPendingReview,
  ReviewInputError,
  stripDocNumber,
  validateReviewItems,
} from '@/lib/admin/logic';
import { summarizeApplicantDocs } from '@/lib/docs/status';
import type { DocReview } from '@/lib/docs/types';
import { DOCS } from './fixtures';
import { makeApplicant } from './memory';

const rv = (docKey: string, subitemTitle: string, status: DocReview['status'], reason = ''): DocReview => ({
  docKey,
  subitemTitle,
  status,
  reason,
  reviewedBy: null,
  updatedAt: null,
});
const person = (extra = {}) => makeApplicant(1, { name: 'สมชาย', phone: '0812345678', approved: true, ...extra });

describe('applicantStage', () => {
  it('ลำดับ: ไม่กรอกข้อมูล → รออนุมัติ → แจ้งเริ่มงาน', () => {
    expect(applicantStage(makeApplicant(1), null, [])).toBe('no_profile');
    expect(applicantStage(person({ approved: false }), null, [])).toBe('pending_approval');
    expect(applicantStage(person({ onboardNotified: true }), null, [])).toBe('onboarded');
  });

  it('มีไฟล์รอตรวจ → review / ตีกลับ → rejected / ยังไม่ส่ง → missing', () => {
    const files = [{ docKey: 'doc9_health_receipt', subitemTitle: '' }];
    const pending = [rv('doc9_health_receipt', '', 'pending_review')];
    expect(applicantStage(person(), summarizeApplicantDocs(DOCS, files, pending), pending)).toBe('review');
    const rejected = [rv('doc9_health_receipt', '', 'rejected', 'ไม่ชัด')];
    expect(applicantStage(person(), summarizeApplicantDocs(DOCS, files, rejected), rejected)).toBe('rejected');
    expect(applicantStage(person(), summarizeApplicantDocs(DOCS, [], []), [])).toBe('missing');
  });

  it('อนุมัติครบ → complete', () => {
    const reviews = DOCS.filter((d) => !d.coversAll).map((d) => rv(d.key, '', 'approved'));
    expect(applicantStage(person(), summarizeApplicantDocs(DOCS, [], reviews), reviews)).toBe('complete');
  });
});

describe('countPendingReview', () => {
  it('เอกสารมีหัวข้อย่อยนับรายหัวข้อ ไม่นับแถวของเอกสารทั้งชิ้นซ้ำ', () => {
    const reviews = [
      rv('doc1_application_set', '', 'pending_review'),
      rv('doc1_application_set', 'ใบสมัครหน้าที่ 1', 'pending_review'),
      rv('doc1_application_set', 'ใบสมัครหน้าที่ 2', 'pending_review'),
      rv('doc9_health_receipt', '', 'pending_review'),
      rv('doc11_guarantor_copy', 'สำเนาบัตรประชาชน', 'approved'),
    ];
    expect(countPendingReview(reviews, DOCS)).toBe(3);
  });
});

describe('validateReviewItems', () => {
  const bad = (items: unknown) => {
    try {
      validateReviewItems(items, DOCS);
      return 'ok';
    } catch (e) {
      return e instanceof ReviewInputError ? e.message : 'other';
    }
  };

  it('ไม่ผ่านต้องมีเหตุผล / เอกสารและหัวข้อต้องมีจริง / สถานะต้องถูก', () => {
    expect(bad([])).toContain('ไม่มีรายการ');
    expect(bad([{ docKey: 'doc9_health_receipt', status: 'rejected', reason: ' ' }])).toContain('เหตุผล');
    expect(bad([{ docKey: 'nope', status: 'approved' }])).toContain('ไม่พบประเภทเอกสาร');
    expect(bad([{ docKey: 'doc1_application_set', subitemTitle: 'หน้า 9', status: 'approved' }])).toContain('ไม่พบหัวข้อ');
    expect(bad([{ docKey: 'doc9_health_receipt', status: 'ok' }])).toContain('สถานะ');
  });

  it('ผ่าน → ล้างเหตุผลทิ้ง', () => {
    expect(validateReviewItems([{ docKey: 'doc9_health_receipt', status: 'approved', reason: 'x' }], DOCS)).toEqual([
      { docKey: 'doc9_health_receipt', subitemTitle: '', status: 'approved', reason: '' },
    ]);
  });
});

describe('completionChange', () => {
  it('ครบครั้งแรก → ตั้งวันที่ + ล็อกชุดเอกสาร (ไม่รวมไฟล์รวม)', () => {
    const c = completionChange(true, null, null, DOCS);
    expect(c.completedAt).toBeTruthy();
    expect(c.requiredDocKeys).toEqual(['doc1_application_set', 'doc9_health_receipt', 'doc11_guarantor_copy']);
  });
  it('มี snapshot อยู่แล้ว → ไม่ทับ / ไม่ครบแล้ว → ล้างวันที่ / ไม่เปลี่ยน → ไม่ทำอะไร', () => {
    expect(completionChange(true, null, ['doc9_health_receipt'], DOCS).requiredDocKeys).toBeUndefined();
    expect(completionChange(false, '2026-01-01', ['x'], DOCS)).toEqual({ completedAt: null });
    expect(completionChange(true, '2026-01-01', ['x'], DOCS)).toEqual({});
    expect(completionChange(false, null, null, DOCS)).toEqual({});
  });
});

describe('buildReviewMessages', () => {
  it('ไม่ผ่านหลายรายการ → ข้อความเดียว มีรายการ + เหตุผลแต่ละข้อ + ปุ่มเปิดเมนูแนบไฟล์', () => {
    const msgs = buildReviewMessages(
      'สมชาย',
      [
        { docKey: 'doc1_application_set', subitemTitle: 'ใบสมัครหน้าที่ 2', status: 'rejected', reason: 'ภาพไม่ชัด' },
        { docKey: 'doc9_health_receipt', subitemTitle: '', status: 'rejected', reason: 'ส่งผิดเอกสาร' },
        { docKey: 'doc11_guarantor_copy', subitemTitle: '', status: 'approved', reason: '' },
      ],
      DOCS,
      null,
    );
    expect(msgs.map((m) => m.type)).toEqual(['rejected', 'approved']);
    const rejected = JSON.stringify(msgs[0].bubble);
    expect(rejected).toContain('ใบสมัคร - ใบสมัครหน้าที่ 2: ภาพไม่ชัด');
    expect(rejected).toContain('ใบเสร็จตรวจสุขภาพ: ส่งผิดเอกสาร');
    expect(rejected).toContain('"type":"postback"');
    expect(rejected).toContain('action=open_menu');
    expect(JSON.stringify(msgs[1].bubble)).toContain('สำเนาเอกสารคนค้ำ');
  });

  it('ไม่มีอะไรต้องแจ้ง (รอตรวจ) → ไม่ส่ง', () => {
    expect(buildReviewMessages('ก', [{ docKey: 'doc9_health_receipt', subitemTitle: '', status: 'pending_review', reason: '' }], DOCS, null)).toEqual([]);
  });

  it('stripDocNumber', () => {
    expect(stripDocNumber('11. สำเนาเอกสารคนค้ำ')).toBe('สำเนาเอกสารคนค้ำ');
    expect(stripDocNumber('KYC')).toBe('KYC');
  });
});
