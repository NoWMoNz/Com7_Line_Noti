import { describe, expect, it } from 'vitest';
import {
  branchLockedFields,
  exactBranch,
  searchBranches,
  buildOnboardBubble,
  cleanBranchDisplay,
  DEFAULT_ONBOARD_TEMPLATES,
  fillTemplate,
  findBranch,
  formatThaiDate,
  mergeTemplates,
  missingOnboardFields,
  resolveTemplateKey,
  type OnboardEmployee,
} from '@/lib/admin/onboarding';
import { canAccess, canEditAfterOnboard, canManageUser, canSendOnboarding } from '@/lib/admin/roles';

const emp: OnboardEmployee = {
  name: 'สมชาย ใจดี',
  phone: '0812345678',
  branch: 'ID1234 - Studio7 สยามพารากอน',
  company: 'Com7',
  position: 'พนักงานขาย',
  startDate: '2026-12-01',
  salary: 15000,
  ta: 'TA1',
  notes: '',
};

describe('ข้อความแจ้งเริ่มงาน', () => {
  it('เติมค่าในเทมเพลต: วันที่แบบไทย, เงินเดือนมีคอมมา, สาขาตัดรหัสออก', () => {
    const msg = fillTemplate(DEFAULT_ONBOARD_TEMPLATES.Com7.template, emp);
    expect(msg).toContain('วันที่เริ่มงาน: 1 ธ.ค. 2569');
    expect(msg).toContain('เงินเดือน: 15,000 บาท/เดือน');
    expect(msg).toContain('สาขา: Studio7 สยามพารากอน');
    expect(msg).not.toContain('{{');
  });

  it('มีหมายเหตุแต่เทมเพลตไม่มี {{notes}} → ต่อท้ายเป็น "หมายเหตุเพิ่มเติม"', () => {
    const msg = fillTemplate(DEFAULT_ONBOARD_TEMPLATES.Com7.template, { ...emp, notes: 'นำบัตรประชาชนมาด้วย' });
    expect(msg.endsWith('หมายเหตุเพิ่มเติม\nนำบัตรประชาชนมาด้วย')).toBe(true);
  });

  it('เลือกเทมเพลตตามบริษัท', () => {
    const t = DEFAULT_ONBOARD_TEMPLATES;
    expect(resolveTemplateKey('Com7', t)).toBe('Com7');
    expect(resolveTemplateKey('double 7', t)).toBe('Double7');
    expect(resolveTemplateKey('DB7 Co.', t)).toBe('Double7');
    expect(resolveTemplateKey('', t)).toBe('Default');
  });

  it('เทมเพลตที่บันทึกไว้ทับค่าตั้งต้น และข้ามค่าที่ผิดรูป', () => {
    const t = mergeTemplates({ Com7: { label: 'C7', template: 'สวัสดี {{name}}' }, Broken: { label: 'x' } });
    expect(t.Com7.template).toBe('สวัสดี {{name}}');
    expect(t.Double7).toEqual(DEFAULT_ONBOARD_TEMPLATES.Double7);
    expect(t.Broken).toBeUndefined();
  });

  it('formatThaiDate / cleanBranchDisplay', () => {
    expect(formatThaiDate('2027-01-15')).toBe('15 ม.ค. 2570');
    expect(formatThaiDate(null)).toBe('-');
    expect(cleanBranchDisplay('12 - Banana สาขา 1')).toBe('Banana สาขา 1');
    expect(cleanBranchDisplay('สำนักงานใหญ่')).toBe('สำนักงานใหญ่');
  });

  it('ข้อมูลที่ต้องมีก่อนส่ง', () => {
    expect(missingOnboardFields(emp)).toEqual([]);
    expect(missingOnboardFields({ ...emp, startDate: null, position: ' ' })).toEqual(['วันที่เริ่มงาน', 'ตำแหน่ง']);
  });

  it('การ์ด: มีลิงก์ในหมายเหตุ → ปุ่มเปิดลิงก์ / ไม่มี → ปุ่มรับทราบ', () => {
    const withLink = JSON.stringify(buildOnboardBubble(emp, fillTemplate(DEFAULT_ONBOARD_TEMPLATES.Com7.template, emp), '#47A838', null));
    expect(withLink).toContain('https://shorturl.at/Jf4wP');
    expect(withLink).toContain('เปิดลิงก์รหัสพนักงาน');
    const body = fillTemplate('รายละเอียด\nวันที่เริ่มงาน: {{startDate}}', emp);
    const noLink = JSON.stringify(buildOnboardBubble(emp, body, '#47A838', null));
    expect(noLink).toContain('รับทราบข้อมูลเริ่มงาน');
  });
});

describe('findBranch', () => {
  const branches = [
    { id: 1, label: 'ID100 - Studio7 Central Khonkaen', company: 'Com7', shopName: 'Studio7 Central Khonkaen' },
    { id: 2, label: 'ID200 - Banana The Mall Bangkae', company: 'Double7', shopName: 'Banana The Mall Bangkae' },
  ];
  it('ตรงทั้งข้อความ / ตรงชื่อร้าน / มีชื่อร้านอยู่ในข้อความ', () => {
    expect(findBranch('ID100 - Studio7 Central Khonkaen', branches)?.id).toBe(1);
    expect(findBranch('banana the mall bangkae', branches)?.id).toBe(2);
    expect(findBranch('สาขา Banana The Mall Bangkae ชั้น 2', branches)?.id).toBe(2);
    expect(findBranch('', branches)).toBeNull();
  });
});

describe('สิทธิ์ตาม role (เหมือนระบบเดิม)', () => {
  it('หน้าที่เข้าได้', () => {
    expect(canAccess('Admin', 'applicants')).toBe(true);
    expect(canAccess('Admin', 'users')).toBe(false);
    expect(canAccess('Admin', 'overview')).toBe(false);
    expect(canAccess('Admin2', 'settings')).toBe(false);
    expect(canAccess('SuperAdmin', 'users')).toBe(true);
    expect(canAccess('SuperAdmin', 'documents')).toBe(false);
    expect(canAccess('Developer', 'documents')).toBe(true);
  });
  it('แจ้งเริ่มงาน: Admin ส่งไม่ได้ / แก้หลังส่งได้เฉพาะ SuperAdmin ขึ้นไป', () => {
    expect(canSendOnboarding('Admin')).toBe(false);
    expect(canSendOnboarding('Admin2')).toBe(true);
    expect(canEditAfterOnboard('Admin2')).toBe(false);
    expect(canEditAfterOnboard('SuperAdmin')).toBe(true);
  });
  it('SuperAdmin จัดการบัญชี Developer ไม่ได้', () => {
    expect(canManageUser('SuperAdmin', 'Developer')).toBe(false);
    expect(canManageUser('SuperAdmin', 'Admin')).toBe(true);
    expect(canManageUser('Admin2', 'Admin')).toBe(false);
  });
});

describe('branchLockedFields — ค่าที่ต้องตามตารางสาขา', () => {
  it('บริษัทตามสาขาเสมอ (ปรับชื่อเป็นมาตรฐาน) และ TA/Intern เมื่อสาขาระบุไว้', () => {
    expect(branchLockedFields({ id: 1, label: 'X', company: 'DOUBLE 7', ta: ' คุณเอ ', intern: 'คุณบี' })).toEqual({
      company: 'Double7',
      ta: 'คุณเอ',
      intern: 'คุณบี',
    });
  });

  it('สาขาไม่ได้ระบุ TA/Intern → ไม่ล็อก (ให้กรอกเองได้)', () => {
    expect(branchLockedFields({ id: 1, label: 'X', company: 'Com7', ta: '', intern: '' })).toEqual({ company: 'Com7' });
  });
});

describe('จับคู่ / ค้นหาสาขา (ข้อมูลจริงจากระบบเดิม)', () => {
  const branches = [
    { id: 9, label: '9 - ID9 : BN-Zeer-Rangsit-2.1', company: 'Double7', shopName: 'ID9 : BN-Zeer-Rangsit-2.1', shopCode: '9', ta: 'คุณเอ' },
    { id: 3285, label: '3285 - ID 3285  Samsung Big C BangBon', company: 'Com7', shopName: 'ID 3285  Samsung Big C BangBon', shopCode: '3285' },
    { id: 3169, label: '3169 - ID 3169 Samsung Lotus-Ratchaburi', company: 'Com7', shopName: 'ID 3169 Samsung Lotus-Ratchaburi', shopCode: '3169' },
  ];

  it('ชื่อสาขาสะกดต่างจากตาราง แต่รหัสสาขาตรง → จับคู่ได้', () => {
    expect(exactBranch('9 - ID 9_BN_Zeer_Rangsit_2.1', branches)?.id).toBe(9);
    expect(exactBranch('3169 - ID 3169 Sumsung Lotus Ratchaburi', branches)?.id).toBe(3169);
    expect(findBranch('9 - ID 9_BN_Zeer_Rangsit_2.1', branches)?.id).toBe(9);
  });

  it('ไม่สนช่องว่างซ้ำ / ตัวพิมพ์ แต่ยังไม่จับตอนพิมพ์ไม่ครบ', () => {
    expect(exactBranch('3285 - id 3285 samsung big c bangbon', branches)?.id).toBe(3285);
    expect(exactBranch('Samsung', branches)).toBeNull();
  });

  it('ค้นหาหลายคำไม่สนลำดับ/เครื่องหมาย และค้นด้วยรหัสได้', () => {
    expect(searchBranches('bangbon samsung', branches).map((b) => b.id)).toEqual([3285]);
    expect(searchBranches('lotus ratchaburi', branches).map((b) => b.id)).toEqual([3169]);
    expect(searchBranches('zeer rangsit', branches).map((b) => b.id)).toEqual([9]);
    expect(searchBranches('3285', branches)[0].id).toBe(3285);
    expect(searchBranches('   ', branches)).toEqual([]);
  });
});
