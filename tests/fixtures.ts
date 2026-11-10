import type { DocType } from '@/lib/docs/types';

const doc = (key: string, label: string, sortOrder: number, subitems: Array<string | [string, boolean]> = [], extra: Partial<DocType> = {}): DocType => ({
  key,
  label,
  description: '',
  sortOrder,
  enabled: true,
  optional: false,
  coversAll: false,
  subitems: subitems.map((s) => (Array.isArray(s) ? { title: s[0], optional: s[1] } : { title: s, optional: false })),
  checks: [],
  ...extra,
});

/** ชุดเอกสารย่อสำหรับ test: ไฟล์รวม + เอกสาร 3 หน้า + เอกสารชิ้นเดียว + เอกสารที่มีหัวข้อ "ถ้ามี" */
export const DOCS: DocType[] = [
  doc('doc0_all_in_one', 'รวมเอกสาร', 0, [], { optional: true, coversAll: true }),
  doc('doc1_application_set', '1. ใบสมัคร', 1, ['ใบสมัครหน้าที่ 1', 'ใบสมัครหน้าที่ 2', 'ใบสมัครหน้าที่ 3']),
  doc('doc9_health_receipt', '9. ใบเสร็จตรวจสุขภาพ', 2, [], { checks: ['ชื่อตรงกับผู้สมัคร'] }),
  doc('doc11_guarantor_copy', '11. สำเนาเอกสารคนค้ำ', 3, ['สำเนาบัตรประชาชน', ['สลิปเงินเดือน (ถ้ามี)', true]]),
];
