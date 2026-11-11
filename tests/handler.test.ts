import { beforeEach, describe, expect, it } from 'vitest';
import { PDPA_VERSION } from '@/lib/apply/pdpa';
import { buildAppLink, buildPersonalLink, handleLineEvent, parseQuery, type HandlerDeps } from '@/lib/line/handler';
import type { LineEvent, LineMessage } from '@/lib/line/types';
import { createFakeLine, createMemoryRepo } from './memory';

const UID = 'U_test_user';
const textEvent = (t: string): LineEvent => ({ type: 'message', replyToken: 'r', source: { type: 'user', userId: UID }, message: { id: 'm1', type: 'text', text: t } });
const postback = (data: string): LineEvent => ({ type: 'postback', replyToken: 'r', source: { type: 'user', userId: UID }, postback: { data } });
const imageEvent = (): LineEvent => ({ type: 'message', replyToken: 'r', source: { type: 'user', userId: UID }, message: { id: 'img1', type: 'image' } });
const lastReply = (replies: LineMessage[][]) => JSON.stringify(replies.at(-1) ?? null);

let mem: ReturnType<typeof createMemoryRepo>;
let fake: ReturnType<typeof createFakeLine>;
let deps: HandlerDeps;
const config = { liffId: 'LIFF123', appBaseUrl: 'https://example.com', logoUrl: null, maxUploadBytes: 2 * 1024 * 1024 };

beforeEach(() => {
  mem = createMemoryRepo();
  fake = createFakeLine();
  deps = { repo: mem.repo, line: fake.line, config };
});

const registered = (extra = {}) =>
  mem.add({ name: 'สมชาย', phone: '0812345678', lineUserId: UID, pdpaVersion: PDPA_VERSION, pdpaAcceptedAt: '2026-01-01', ...extra });

describe('ลงทะเบียน', () => {
  it('คนใหม่ → การ์ดเปิดหน้าลงทะเบียน (ลิงก์ไม่มี token) และไม่สร้างข้อมูลผู้สมัครเปล่า', async () => {
    await handleLineEvent(textEvent('ลงทะเบียน ยืนยันตัวตน'), deps);
    expect(mem.applicants).toHaveLength(0);
    expect(fake.replies[0][0].type).toBe('flex');
    expect(lastReply(fake.replies)).toContain('"uri":"https://miniapp.line.me/LIFF123"');
  });

  it('ลงทะเบียนแล้ว รออนุมัติ → แจ้งรออนุมัติ / อนุมัติแล้ว → บอกว่าอนุมัติแล้ว', async () => {
    const a = registered();
    await handleLineEvent(textEvent('ลงทะเบียนยืนยันตัวตน'), deps);
    expect(lastReply(fake.replies)).toContain('รอการอนุมัติ');
    a.approved = true;
    await handleLineEvent(textEvent('ลงทะเบียน ยืนยันตัวตน'), deps);
    expect(lastReply(fake.replies)).toContain('ได้รับการอนุมัติแล้ว');
  });
});

describe('สถานะ / เมนู', () => {
  it('ยังไม่ลงทะเบียน → พาไปหน้าลงทะเบียน', async () => {
    await handleLineEvent(textEvent('เมนู'), deps);
    expect(lastReply(fake.replies)).toContain('ลงทะเบียนสมัครงาน');
  });

  it('อนุมัติแล้ว → สรุปส่งแล้ว X จาก Y + รายการที่ขาด (ระบุที่ต้องแก้) + ปุ่มเปิดหน้าส่งเอกสาร', async () => {
    const a = registered({ approved: true });
    await mem.repo.saveUploadedFile({ applicant: a, docKey: 'doc9_health_receipt', subitemTitle: '', bytes: new Uint8Array(1), mimeType: 'image/jpeg', source: 'web' });
    mem.review(a.id, 'doc9_health_receipt', '', 'rejected', 'ไม่ชัด');
    await handleLineEvent(textEvent('สถานะ'), deps);
    const r = lastReply(fake.replies);
    expect(r).toContain('ส่งแล้ว 0 จาก 3 รายการ');
    expect(r).toContain('9. ใบเสร็จตรวจสุขภาพ (ต้องแก้ไข)');
    expect(r).toContain('เปิดหน้าส่งเอกสาร');
  });

  it('ส่งครบแล้ว → การ์ดขอบคุณ', async () => {
    const a = registered({ approved: true });
    await mem.repo.saveUploadedFile({ applicant: a, docKey: 'doc0_all_in_one', subitemTitle: '', bytes: new Uint8Array(1), mimeType: 'application/pdf', source: 'web' });
    await handleLineEvent(textEvent('ตรวจสอบ'), deps);
    expect(lastReply(fake.replies)).toContain('ส่งเอกสารครบถ้วนแล้ว');
  });

  it('ปุ่มจากการ์ดเก่าของระบบเดิม (postback) → ตอบสถานะแทนเมนูในแชท', async () => {
    registered({ approved: true });
    await handleLineEvent(postback('action=select_doc&docKey=doc9_health_receipt'), deps);
    expect(lastReply(fake.replies)).toContain('สถานะเอกสารของคุณ');
  });
});

describe('ส่งรูปในแชท', () => {
  it('ไม่มีบัญชี → เงียบ / มีบัญชี → แจ้งให้ส่งผ่านหน้าส่งเอกสาร และไม่บันทึกไฟล์', async () => {
    await handleLineEvent(imageEvent(), deps);
    expect(fake.replies).toHaveLength(0);
    registered({ approved: true });
    await handleLineEvent(imageEvent(), deps);
    expect(lastReply(fake.replies)).toContain('ไม่รับเอกสารทางแชทแล้ว');
    expect(mem.files).toHaveLength(0);
  });

  it('ข้อความอื่น → เงียบ', async () => {
    registered({ approved: true });
    await handleLineEvent(textEvent('สวัสดีครับ'), deps);
    expect(fake.replies).toHaveLength(0);
  });
});

describe('ลิงก์', () => {
  it('ลิงก์ทั่วไปไม่มี token / ลิงก์ส่วนตัวมี token / เปิดเอกสารตรงๆ ได้ / ไม่มี LIFF ID → หน้าเว็บ', () => {
    expect(buildAppLink(config)).toBe('https://miniapp.line.me/LIFF123');
    expect(buildAppLink(config, { doc: 'doc3_id_card' })).toBe('https://miniapp.line.me/LIFF123?doc=doc3_id_card');
    expect(buildPersonalLink(config, 'tok1')).toBe('https://miniapp.line.me/LIFF123?token=tok1');

    // ใช้ LIFF app เดิมแทน MINI App
    process.env.LINE_APP_LINK = 'liff';
    try {
      expect(buildAppLink(config, { doc: 'doc3_id_card' })).toBe('https://liff.line.me/LIFF123?doc=doc3_id_card');
    } finally {
      delete process.env.LINE_APP_LINK;
    }
    expect(buildPersonalLink({ ...config, liffId: '', appBaseUrl: 'https://example.com/' }, 'a b')).toBe('https://example.com/apply?token=a+b');
  });

  it('parseQuery', () => {
    expect(parseQuery('action=select_doc&label=%E0%B8%81+x')).toEqual({ action: 'select_doc', label: 'ก x' });
  });
});
