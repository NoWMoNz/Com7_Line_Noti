import { describe, expect, it } from 'vitest';
import { summarizeApplicantDocs } from '@/lib/docs/status';
import {
  buildReminderBubble,
  formatDeadline,
  missingLabels,
  needsReminder,
  parseAutoSettings,
  shouldSendDeadlineReminder,
  shouldSendFollowup,
} from '@/lib/reminders/rules';
import { DOCS } from './fixtures';

const H = 3600_000;
const NOW = Date.parse('2026-11-10T02:00:00Z');
const iso = (offsetH: number) => new Date(NOW + offsetH * H).toISOString();

describe('เตือนใกล้กำหนดส่ง', () => {
  it('เหลือไม่ถึง 48 ชม. หรือเลยแล้ว → ส่ง / ไกลกว่านั้นหรือไม่มีกำหนด → ไม่ส่ง', () => {
    expect(shouldSendDeadlineReminder(iso(47), null, NOW)).toBe(true);
    expect(shouldSendDeadlineReminder(iso(-24), null, NOW)).toBe(true);
    expect(shouldSendDeadlineReminder(iso(49), null, NOW)).toBe(false);
    expect(shouldSendDeadlineReminder(null, null, NOW)).toBe(false);
  });
  it('เพิ่งเตือนไปไม่ถึง 20 ชม. → ไม่ส่งซ้ำ', () => {
    expect(shouldSendDeadlineReminder(iso(10), iso(-19), NOW)).toBe(false);
    expect(shouldSendDeadlineReminder(iso(10), iso(-21), NOW)).toBe(true);
  });
});

describe('ติดตาม 3 วันหลัง HR ตรวจ', () => {
  it('ครบ 3 วัน ยังไม่ส่งไฟล์เพิ่ม และยังไม่เคยตามในรอบนี้ → ส่ง', () => {
    expect(shouldSendFollowup(iso(-73), iso(-100), null, NOW)).toBe(true);
  });
  it('ยังไม่ครบ 3 วัน / ส่งไฟล์หลัง HR ตรวจ / ตามไปแล้ว / HR ยังไม่ตรวจ → ไม่ส่ง', () => {
    expect(shouldSendFollowup(iso(-71), null, null, NOW)).toBe(false);
    expect(shouldSendFollowup(iso(-73), iso(-10), null, NOW)).toBe(false);
    expect(shouldSendFollowup(iso(-73), null, iso(-1), NOW)).toBe(false);
    expect(shouldSendFollowup(null, null, null, NOW)).toBe(false);
  });
});

describe('ใครต้องเตือน / ข้อความ', () => {
  it('ยังไม่ส่ง → ต้องเตือน, ส่งครบ (รอตรวจ) → ไม่เตือน, แจ้งเริ่มงานแล้ว → ไม่เตือน', () => {
    const empty = summarizeApplicantDocs(DOCS, [], []);
    expect(needsReminder(empty, false)).toBe(true);
    expect(needsReminder(empty, true)).toBe(false);
    const allInOne = summarizeApplicantDocs(DOCS, [{ docKey: 'doc0_all_in_one', subitemTitle: '' }], []);
    expect(needsReminder(allInOne, false)).toBe(false);
    expect(missingLabels(empty)).toEqual(['1. ใบสมัคร', '9. ใบเสร็จตรวจสุขภาพ', '11. สำเนาเอกสารคนค้ำ']);
  });
  it('กำหนดส่งแสดงเป็นเวลาไทย / การ์ดมีรายการที่ขาด + กำหนดส่ง + ข้อความ HR', () => {
    expect(formatDeadline('2026-12-01T10:00:00Z')).toBe('1 ธ.ค. 2569 (17:00 น.)');
    const s = JSON.stringify(
      buildReminderBubble({ name: 'สมชาย', missing: ['ใบสมัคร'], deadline: '2026-12-01T10:00:00Z', feedback: 'ภาพไม่ชัด', link: 'https://x', logoUrl: null }),
    );
    expect(s).toContain('ยังส่งเอกสารไม่ครบ (1 รายการ)');
    expect(s).toContain('กรุณาส่งภายใน 1 ธ.ค. 2569 (17:00 น.)');
    expect(s).toContain('ภาพไม่ชัด');
  });
  it('สวิตช์อัตโนมัติ: ค่าเริ่มต้นปิด', () => {
    expect(parseAutoSettings(null)).toEqual({ deadline: false, followup: false });
    expect(parseAutoSettings({ deadline: true, followup: 'yes' })).toEqual({ deadline: true, followup: false });
  });
});
