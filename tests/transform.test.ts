import { describe, expect, it } from 'vitest';
import { buildMigrationPlan, normalizeThaiPhone, parseDateOnly, parseTimestamp, type SheetExport } from '@/lib/migration/transform';

const D = 'https://drive.google.com/file/d/';

/** ข้อมูลจำลองที่เลียนแบบความไม่สม่ำเสมอของชีทจริง */
const EXPORT: SheetExport = {
  exportedAt: '2026-11-09T10:00:00.000Z',
  sheets: {
    DocConfig: [
      ['doc_key', 'doc_label', 'doc_description', 'doc_subitems', 'enabled'],
      ['doc0_all_in_one', 'รวมเอกสาร', '', '[]', ''],
      ['doc1_application_set', '1. ใบสมัคร', '', '["ใบสมัครหน้าที่ 1","ใบสมัครหน้าที่ 2","ใบสมัครหน้าที่ 3"]', ''],
      ['doc9_health_receipt', '9. ใบเสร็จ', '', '[]', 'FALSE'],
      ['doc11_guarantor_copy', '11. สำเนาคนค้ำ', '', '["สำเนาบัตรประชาชน","สลิปเงินเดือน (ถ้ามี)"]', ''],
    ],
    Applicants: [
      ['applicant_id', 'name', 'phone', 'branch', 'line_user_id', 'token', 'approved', 'doc0_all_in_one', 'doc1_application_set', 'doc9_health_receipt', 'doc11_guarantor_copy', 'doc_reviews_json', 'start_date', 'created_at'],
      [
        'APP_1', 'สมชาย', 812345678, '1001 - สาขาสยาม', 'U1', 'tokA', 'yes', '',
        // หน้า 1 ผ่านเว็บ (prefix doc key), หน้า 2 ผ่าน LINE (prefix canon "application" — บั๊กเดิม)
        `doc1_application_set::ใบสมัครหน้าที่ 1::${D}a\napplication::ใบสมัครหน้าที่ 2::${D}b`,
        `${D}c`,
        // "สลิปเงินเดือน" จาก LINE ไม่มี "(ถ้ามี)" → ต้องจับคู่กับ "สลิปเงินเดือน (ถ้ามี)"
        `guarantor-copy::สลิปเงินเดือน::${D}d`,
        JSON.stringify({
          doc1_application_set: { s: 'approved', t: '2026-10-01T00:00:00Z', by: 'HR A', r: 'ค้างจากตีกลับ' },
          'application::ใบสมัครหน้าที่ 2': { status: 'rejected', reason: 'ไม่ชัด', updatedAt: '2026-10-02T00:00:00Z' },
          'personal::สำเนาบัตรประชาชน': { s: 'approved' },
          doc9_health_receipt: { s: 'weird' },
        }),
        '15/12/2569',
        '01/10/2026 09:30:00',
      ],
      [
        'APP_2', 'สมหญิง', '+66 89-123-4567', '', 'U1', 'tokA', '', `${D}all`,
        `${D}all`, // URL ไฟล์รวมที่ถูกคัดลอกมาใส่เซลล์อื่น
        '', '', '', '', '',
      ],
      ['', 'แถวว่าง', '', '', '', '', '', '', '', '', '', '', '', ''],
    ],
    Database: [
      ['ID', 'Shop', 'Company', 'จังหวัด'],
      ['1001', 'สาขาสยาม', '', 'กรุงเทพ'],
      ['', '', '', ''],
    ],
    'Login Admin': [
      ['admin_id', 'email', 'full_name', 'role', 'status'],
      ['ADM_1', 'HR@Com7.co.th', 'HR A', 'super admin', 'active'],
      ['ADM_2', 'hr@com7.co.th', 'ซ้ำ', 'admin', ''],
      ['ADM_3', 'old@com7.co.th', 'Old', 'dev', 'inactive'],
    ],
    Config: [
      ['LIFF_ID', '123-abc'],
      ['CHANNEL_ACCESS_TOKEN', 'secret!'],
      ['ONBOARD_TEMPLATES', '{"Com7":"สวัสดี"}'],
    ],
    Notification_Log: [
      ['TimeStamp', 'Type', 'Applicant_ID', 'Applicant_Name', 'Phone', 'Sent_By', 'Status', 'Message_Preview', 'Error'],
      ["'09/11/2026 08:00:00", 'reminder', 'APP_1', 'สมชาย', '', 'System', 'ok', 'เตือน', ''],
    ],
    Database_Logs: [
      ['TimeStamp', 'Name', 'Action', 'Target_ID', 'Changes_Detail'],
      ['09/11/2026 08:00:00', 'สมชาย', 'อัปโหลดผ่าน LINE', 'APP_1', 'doc1 (120 KB)'],
    ],
  },
};

describe('buildMigrationPlan', () => {
  const plan = buildMigrationPlan(EXPORT);

  it('DocConfig: ไฟล์รวม = covers_all, เอกสารที่ปิด, หัวข้อ "(ถ้ามี)" = optional', () => {
    // + เอกสารไม่บังคับที่ระบบใหม่แยกออกมา (เปลี่ยนชื่อ / ทหาร) ต่อท้าย
    expect(plan.docTypes.map((d) => d.key)).toEqual([
      'doc0_all_in_one',
      'doc1_application_set',
      'doc9_health_receipt',
      'doc11_guarantor_copy',
      'doc13_name_change',
      'doc14_military',
    ]);
    expect(plan.docTypes.at(-1)).toMatchObject({ optional: true, enabled: true });
    expect(plan.docTypes[0]).toMatchObject({ covers_all: true, optional: true });
    expect(plan.docTypes[2].enabled).toBe(false);
    expect(plan.docSubitems.find((s) => s.title.startsWith('สลิป'))?.optional).toBe(true);
  });

  it('ผู้สมัคร: ข้ามแถวว่าง, แก้เบอร์ที่ 0 หาย, วันที่ พ.ศ., ไม่ผูก LINE/token ซ้ำ', () => {
    expect(plan.applicants.map((a) => a.code)).toEqual(['APP_1', 'APP_2']);
    const [a1, a2] = plan.applicants;
    expect(a1).toMatchObject({ phone: '0812345678', approved: true, line_user_id: 'U1', access_token: 'tokA', start_date: '2026-12-15' });
    expect(a1.created_at).toBe('2026-10-01T02:30:00.000Z');
    expect(a2).toMatchObject({ phone: '0891234567', approved: false, line_user_id: null });
    expect(a2.access_token).not.toBe('tokA');
    expect(a2.access_token).toMatch(/^[0-9a-f]{32}$/);
    expect(plan.warnings.join('\n')).toMatch(/line_user_id ซ้ำ/);
    expect(plan.warnings.join('\n')).toMatch(/token ซ้ำ/);
  });

  it('ไฟล์: แยกหัวข้อย่อยได้ทั้ง prefix doc key และ prefix ของ LINE', () => {
    const f1 = plan.files.filter((f) => f.applicant_code === 'APP_1');
    expect(f1).toEqual(
      expect.arrayContaining([
        { applicant_code: 'APP_1', doc_key: 'doc1_application_set', subitem_title: 'ใบสมัครหน้าที่ 1', legacy_url: `${D}a` },
        { applicant_code: 'APP_1', doc_key: 'doc1_application_set', subitem_title: 'ใบสมัครหน้าที่ 2', legacy_url: `${D}b` },
        { applicant_code: 'APP_1', doc_key: 'doc9_health_receipt', subitem_title: '', legacy_url: `${D}c` },
        { applicant_code: 'APP_1', doc_key: 'doc11_guarantor_copy', subitem_title: 'สลิปเงินเดือน (ถ้ามี)', legacy_url: `${D}d` },
      ]),
    );
    expect(f1).toHaveLength(4);
  });

  it('ไฟล์: URL ไฟล์รวมที่ถูกคัดลอกไปเซลล์อื่นไม่ถูกนับซ้ำ', () => {
    const f2 = plan.files.filter((f) => f.applicant_code === 'APP_2');
    expect(f2).toEqual([{ applicant_code: 'APP_2', doc_key: 'doc0_all_in_one', subitem_title: '', legacy_url: `${D}all` }]);
  });

  it('ผลตรวจ: อ่านได้ทั้งรูปแบบย่อ/เต็ม, ตัด reason ของที่อนุมัติ, ข้ามคีย์ที่ไม่รู้จัก', () => {
    const r = plan.reviews.filter((x) => x.applicant_code === 'APP_1');
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.subitem_title === '')).toMatchObject({ doc_key: 'doc1_application_set', status: 'approved', reason: '', reviewed_by: 'HR A' });
    expect(r.find((x) => x.subitem_title === 'ใบสมัครหน้าที่ 2')).toMatchObject({ status: 'rejected', reason: 'ไม่ชัด' });
    expect(plan.warnings.join('\n')).toMatch(/ข้ามผลตรวจ 1 รายการ/);
  });

  it('ผลตรวจกลุ่มของหน้าอัปโหลดเดิม: bank → หัวข้อบัญชี, personal/health → ทั้งเอกสาร (ตามรูปแบบในชีทจริง)', () => {
    const p = buildMigrationPlan({
      sheets: {
        DocConfig: [
          ['doc_key', 'doc_label', 'doc_description', 'doc_subitems', 'enabled'],
          ['doc3_id_card', '3. สำเนาบัตรประชาชน', '', '["เซ็นรับรอง","วันหมดอายุบัตร"]', ''],
          ['doc9_health_receipt', '9. ใบเสร็จ', '', '[]', ''],
          ['doc10_bookbank', '10. บัญชีเงินเดือน', '', '["สำเนาเปิดบัญชี SCB","ใบเสร็จเครดิตยูโร"]', ''],
        ],
        Applicants: [
          ['applicant_id', 'name', 'phone', 'doc3_id_card', 'doc10_bookbank', 'doc_reviews_json'],
          [
            'APP_9', 'ทดสอบ', '0811111111',
            `personal::สำเนาบัตรประชาชน::${D}id\npersonal::เอกสารทหาร::${D}mil`,
            `bank::สำเนาเปิดบัญชี SCB::${D}scb`,
            JSON.stringify({
              'personal::สำเนาบัตรประชาชน': { s: 'approved' },
              'health::ใบเสร็จตรวจสุขภาพ': { s: 'rejected', r: 'ไม่ชัด' },
              'bank::สำเนาเปิดบัญชี SCB': { s: 'pending_review' },
            }),
          ],
        ],
      },
    });
    // บัตรประชาชน → ช่องหลักของบัตร / เอกสารทหารที่ฝากไว้ในเซลล์บัตร → เอกสารทหาร / bank → หัวข้อถูกช่อง
    expect(p.files.map((f) => `${f.doc_key}|${f.subitem_title}`).sort()).toEqual(['doc10_bookbank|สำเนาเปิดบัญชี SCB', 'doc14_military|', 'doc3_id_card|']);
    expect(p.reviews.map((r) => `${r.doc_key}|${r.subitem_title}|${r.status}`).sort()).toEqual([
      'doc10_bookbank|สำเนาเปิดบัญชี SCB|pending_review',
      'doc3_id_card||approved',
      'doc9_health_receipt||rejected',
    ]);
  });

  it('สาขา / แอดมิน / ค่าตั้งค่า / log', () => {
    expect(plan.branches).toEqual([
      expect.objectContaining({ shop_code: '1001', shop_name: 'สาขาสยาม', company: 'Com7', province: 'กรุงเทพ' }),
    ]);
    expect(plan.admins).toEqual([
      expect.objectContaining({ email: 'hr@com7.co.th', role: 'SuperAdmin', active: true }),
      expect.objectContaining({ email: 'old@com7.co.th', role: 'Developer', active: false }),
    ]);
    expect(plan.settings).toEqual([
      { key: 'LIFF_ID', value: '123-abc' },
      { key: 'ONBOARD_TEMPLATES', value: { Com7: 'สวัสดี' } },
    ]);
    expect(plan.notifications[0]).toMatchObject({ type: 'reminder', applicant_code: 'APP_1', created_at: '2026-11-09T01:00:00.000Z' });
    expect(plan.audits[0]).toMatchObject({ kind: 'activity', actor: 'สมชาย', target_id: 'APP_1' });
  });
});

describe('helpers', () => {
  it('parseTimestamp / parseDateOnly ใช้เวลาไทย', () => {
    expect(parseTimestamp('01/02/2026 00:30')).toBe('2026-01-31T17:30:00.000Z');
    expect(parseDateOnly('2026-01-31T17:30:00.000Z')).toBe('2026-02-01');
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('ไม่ใช่วันที่')).toBeNull();
  });

  it('normalizeThaiPhone', () => {
    expect(normalizeThaiPhone('081-234-5678')).toBe('0812345678');
    expect(normalizeThaiPhone('+66812345678')).toBe('0812345678');
    expect(normalizeThaiPhone(912345678)).toBe('0912345678');
  });
});
