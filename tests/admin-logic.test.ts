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
import type { ReviewItemInput } from '@/lib/admin/types';
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

  it('ส่งเบื้องต้นและอนุมัติครบ → initial_complete (ยังไม่ไปหน้าแจ้งเริ่มงาน)', () => {
    const reviews = DOCS.filter((d) => !d.coversAll).map((d) => rv(d.key, '', 'approved'));
    expect(applicantStage(person({ docScope: 'initial' }), summarizeApplicantDocs(DOCS, [], reviews), reviews)).toBe('initial_complete');
  });

  it('ปิดใบสมัครแล้ว → cancel / turndown มาก่อนทุกสถานะ', () => {
    expect(applicantStage(person({ closedStatus: 'cancel' }), null, [])).toBe('cancel');
    expect(applicantStage(person({ closedStatus: 'turndown', onboardNotified: true }), null, [])).toBe('turndown');
    expect(applicantStage(makeApplicant(1, { closedStatus: 'cancel' }), null, [])).toBe('cancel');
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

  it('ไม่นับหัวข้อย่อยที่ค้างรอตรวจใต้เอกสารที่อนุมัติทั้งชิ้นแล้ว (ข้อมูลจากระบบเดิม)', () => {
    const reviews = [
      rv('doc1_application_set', '', 'approved'),
      rv('doc1_application_set', 'ใบสมัครหน้าที่ 1', 'pending_review'),
      rv('doc1_application_set', 'ใบสมัครหน้าที่ 2', 'pending_review'),
      rv('doc9_health_receipt', '', 'pending_review'),
    ];
    expect(countPendingReview(reviews, DOCS)).toBe(1);
  });

  it('ไฟล์รวมอนุมัติแล้ว → เอกสารอื่นที่ค้างรอตรวจไม่นับ', () => {
    const reviews = [
      rv('doc0_all_in_one', '', 'approved'),
      rv('doc1_application_set', 'ใบสมัครหน้าที่ 1', 'pending_review'),
      rv('doc9_health_receipt', '', 'pending_review'),
    ];
    expect(countPendingReview(reviews, DOCS)).toBe(0);
    expect(applicantStage(person(), summarizeApplicantDocs(DOCS, [], reviews), reviews)).toBe('complete');
  });
});

describe('applicantStage กับหัวข้อย่อยค้าง', () => {
  it('อนุมัติทั้งชิ้นแล้วแต่หัวข้อย่อยยังค้างรอตรวจ → ไม่ใช่ "รอตรวจ"', () => {
    const reviews = [
      rv('doc1_application_set', '', 'approved'),
      rv('doc1_application_set', 'ใบสมัครหน้าที่ 1', 'pending_review'),
    ];
    expect(applicantStage(person(), summarizeApplicantDocs(DOCS, [], reviews), reviews)).toBe('missing');
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
  it('ส่งเบื้องต้นครบ → ตั้งวันที่แต่ไม่ล็อกชุดเอกสาร', () => {
    const c = completionChange(true, null, null, DOCS, 'initial');
    expect(c.completedAt).toBeTruthy();
    expect(c.requiredDocKeys).toBeUndefined();
  });
});

describe('buildReviewMessages', () => {
  const base = { applicantName: 'สมชาย', allDocs: DOCS, linkFor: () => 'https://x', logoUrl: null };
  const approvedItem: ReviewItemInput = { docKey: 'doc9_health_receipt', subitemTitle: '', status: 'approved', reason: '' };
  it('ครบชุดเบื้องต้น → ข้อความ "เอกสารเบื้องต้นผ่านครบ"', () => {
    const [m] = buildReviewMessages({ ...base, items: [approvedItem], becameComplete: true, initialOnly: true });
    expect(m.altText).toContain('เอกสารเบื้องต้น');
  });
});

describe('buildReviewMessages', () => {
  const linkFor = (doc?: string) => `https://miniapp.line.me/L${doc ? `?doc=${doc}` : ''}`;
  const build = (items: ReviewItemInput[], becameComplete = false) =>
    buildReviewMessages({ applicantName: 'สมชาย', items, allDocs: DOCS, becameComplete, linkFor, logoUrl: null });

  it('ไม่ผ่านหลายรายการ → ข้อความเดียว มีเหตุผลแต่ละข้อ + ปุ่มเปิดเอกสารแรกที่ต้องแก้', () => {
    const msgs = build([
      { docKey: 'doc1_application_set', subitemTitle: 'ใบสมัครหน้าที่ 2', status: 'rejected', reason: 'ภาพไม่ชัด' },
      { docKey: 'doc9_health_receipt', subitemTitle: '', status: 'rejected', reason: 'ส่งผิดเอกสาร' },
      { docKey: 'doc11_guarantor_copy', subitemTitle: '', status: 'approved', reason: '' },
    ]);
    expect(msgs.map((m) => m.type)).toEqual(['approved', 'rejected']);
    const s = JSON.stringify(msgs[1].bubble);
    expect(s).toContain('ใบสมัคร - ใบสมัครหน้าที่ 2: ภาพไม่ชัด');
    expect(s).toContain('ใบเสร็จตรวจสุขภาพ: ส่งผิดเอกสาร');
    expect(s).toContain('https://miniapp.line.me/L?doc=doc1_application_set');
  });

  it('ผ่านบางรายการ → แจ้ง "ผ่าน" 1 ข้อความพร้อมความคืบหน้า / ผ่านจนครบครั้งแรก → แจ้งครบอย่างเดียว', () => {
    const approved: ReviewItemInput[] = [
      { docKey: 'doc9_health_receipt', subitemTitle: '', status: 'approved', reason: '' },
      { docKey: 'doc11_guarantor_copy', subitemTitle: '', status: 'approved', reason: '' },
    ];
    const msgs = buildReviewMessages({
      applicantName: 'สมชาย',
      items: approved,
      allDocs: DOCS,
      becameComplete: false,
      linkFor,
      logoUrl: null,
      progress: { approved: 5, total: 8 },
    });
    expect(msgs.map((m) => m.type)).toEqual(['approved']);
    const s = JSON.stringify(msgs[0].bubble);
    expect(s).toContain('ใบเสร็จตรวจสุขภาพ');
    expect(s).toContain('สำเนาเอกสารคนค้ำ');
    expect(s).toContain('ผ่านแล้ว 5 จาก 8 รายการ — เหลืออีก 3 รายการ');
    expect(build(approved, true).map((m) => m.type)).toEqual(['all_approved']);
  });

  it('stripDocNumber', () => {
    expect(stripDocNumber('11. สำเนาเอกสารคนค้ำ')).toBe('สำเนาเอกสารคนค้ำ');
    expect(stripDocNumber('KYC')).toBe('KYC');
  });
});
