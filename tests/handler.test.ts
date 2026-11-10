import { beforeEach, describe, expect, it } from 'vitest';
import { buildPersonalLink, handleLineEvent, parseQuery, type HandlerDeps } from '@/lib/line/handler';
import type { LineEvent, LineMessage } from '@/lib/line/types';
import { createFakeLine, createMemoryRepo } from './memory';

const UID = 'U_test_user';
const textEvent = (t: string): LineEvent => ({ type: 'message', replyToken: 'r', source: { type: 'user', userId: UID }, message: { id: 'm1', type: 'text', text: t } });
const postback = (data: string): LineEvent => ({ type: 'postback', replyToken: 'r', source: { type: 'user', userId: UID }, postback: { data } });
const imageEvent = (): LineEvent => ({ type: 'message', replyToken: 'r', source: { type: 'user', userId: UID }, message: { id: 'img1', type: 'image' } });
const lastText = (replies: LineMessage[][]) => {
  const m = replies.at(-1)?.[0];
  return m?.type === 'text' ? m.text : m?.type;
};

let mem: ReturnType<typeof createMemoryRepo>;
let fake: ReturnType<typeof createFakeLine>;
let deps: HandlerDeps;
const config = { liffId: 'LIFF123', appBaseUrl: 'https://example.com', logoUrl: null, maxUploadBytes: 2 * 1024 * 1024 };

beforeEach(() => {
  mem = createMemoryRepo();
  fake = createFakeLine();
  deps = { repo: mem.repo, line: fake.line, config };
});

async function approvedApplicant() {
  const a = await mem.repo.createApplicantForLine(UID);
  a.approved = true;
  a.name = 'สมชาย';
  return a;
}

describe('handleLineEvent', () => {
  it('คนที่ยังไม่มีบัญชีพิมพ์「เมนู」หรือส่งรูป → เงียบ', async () => {
    await handleLineEvent(textEvent('เมนู'), deps);
    await handleLineEvent(imageEvent(), deps);
    expect(fake.replies).toHaveLength(0);
  });

  it('「ลงทะเบียนยืนยันตัวตน」→ สร้างผู้สมัคร + ส่งลิงก์ MINI App พร้อม token', async () => {
    await handleLineEvent(textEvent('ลงทะเบียน ยืนยันตัวตน'), deps);
    expect(mem.applicants).toHaveLength(1);
    const msg = fake.replies[0][0];
    expect(msg.type).toBe('flex');
    expect(JSON.stringify(msg)).toContain('https://miniapp.line.me/LIFF123?token=tok1');
  });

  it('ไม่มี LIFF ID → ลิงก์ไปหน้า /apply ของเว็บตรงๆ', () => {
    const link = buildPersonalLink({ ...config, liffId: '', appBaseUrl: 'https://example.com/' }, 'a b');
    expect(link).toBe('https://example.com/apply?token=a%20b');
  });

  it('ยังไม่อนุมัติ พิมพ์「สถานะ」→ แจ้งให้รออนุมัติ', async () => {
    await mem.repo.createApplicantForLine(UID);
    await handleLineEvent(textEvent('สถานะ'), deps);
    expect(lastText(fake.replies)).toContain('ยังไม่ได้รับการอนุมัติ');
  });

  it('อนุมัติแล้ว พิมพ์「เมนู」→ สรุป 0 จาก 3 + carousel 3 ใบ', async () => {
    await approvedApplicant();
    await handleLineEvent(textEvent('เมนู'), deps);
    const [summary, carousel] = fake.replies[0];
    expect(summary.type === 'text' && summary.text).toContain('ส่งแล้ว 0 จาก 3 รายการ');
    expect(carousel.type === 'flex' && carousel.contents.type).toBe('carousel');
    if (carousel.type === 'flex' && carousel.contents.type === 'carousel') {
      expect(carousel.contents.contents).toHaveLength(3);
    }
  });

  it('ส่งรูปโดยยังไม่เลือกเอกสาร → เงียบ ไม่บันทึก', async () => {
    await approvedApplicant();
    await handleLineEvent(imageEvent(), deps);
    expect(fake.replies).toHaveLength(0);
    expect(mem.files).toHaveLength(0);
  });

  it('เอกสารหลายหน้าผ่านแชท: เลือกหน้า → ส่งรูป → นับครบเมื่อส่งครบทุกหน้า (บั๊กเดิม: นับไม่ขึ้น)', async () => {
    await approvedApplicant();
    await handleLineEvent(postback('action=select_doc&docKey=doc1_application_set&label=x'), deps);
    const menu = fake.replies.at(-1)![0];
    expect(menu.type === 'flex' && JSON.stringify(menu.contents)).toContain('ไฟล์ย่อย 0/3 ไฟล์');

    for (const page of ['ใบสมัครหน้าที่ 1', 'ใบสมัครหน้าที่ 2', 'ใบสมัครหน้าที่ 3']) {
      await handleLineEvent(postback(`action=select_subitem&docKey=doc1_application_set&subTitle=${encodeURIComponent(page)}`), deps);
      expect(lastText(fake.replies)).toContain(page);
      await handleLineEvent(imageEvent(), deps);
    }
    expect(lastText(fake.replies)).toContain('เหลืออีก 2 รายการ');
    expect(mem.files.filter((f) => f.current)).toHaveLength(3);
    expect(mem.pending.size).toBe(0);
  });

  it('ส่งครบทุกเอกสาร → ตอบว่าครบ + push การ์ดแจ้งครบ + บันทึก notification', async () => {
    await approvedApplicant();
    const send = async (postbackData: string) => {
      await handleLineEvent(postback(postbackData), deps);
      await handleLineEvent(imageEvent(), deps);
    };
    await send('action=select_doc&docKey=doc9_health_receipt');
    for (const p of ['ใบสมัครหน้าที่ 1', 'ใบสมัครหน้าที่ 2', 'ใบสมัครหน้าที่ 3']) {
      await send(`action=select_subitem&docKey=doc1_application_set&subTitle=${encodeURIComponent(p)}`);
    }
    await send(`action=select_subitem&docKey=doc11_guarantor_copy&subTitle=${encodeURIComponent('สำเนาบัตรประชาชน')}`);

    expect(lastText(fake.replies)).toContain('คุณส่งเอกสารครบทุกรายการแล้วค่ะ');
    expect(fake.pushes).toHaveLength(1);
    expect(mem.notifications).toEqual(['docs_complete']);
  });

  it('ไฟล์ชนิดไม่รองรับ / ใหญ่เกิน → แจ้งเตือน ไม่บันทึก', async () => {
    await approvedApplicant();
    const f1 = createFakeLine('video/mp4');
    deps.line = f1.line;
    await handleLineEvent(postback('action=select_doc&docKey=doc9_health_receipt'), deps);
    await handleLineEvent(imageEvent(), deps);
    expect(lastText(f1.replies)).toContain('รองรับเฉพาะ');

    const f2 = createFakeLine('image/jpeg', 5 * 1024 * 1024);
    deps.line = f2.line;
    await handleLineEvent(imageEvent(), deps);
    expect(lastText(f2.replies)).toContain('ใหญ่เกิน 2 MB');
    expect(mem.files).toHaveLength(0);
  });

  it('postback หัวข้อย่อยที่ไม่มีอยู่จริง → ไม่ตั้ง pending', async () => {
    await approvedApplicant();
    await handleLineEvent(postback('action=select_subitem&docKey=doc1_application_set&subTitle=hack'), deps);
    expect(mem.pending.size).toBe(0);
  });
});

describe('parseQuery', () => {
  it('ถอดรหัส postback data ภาษาไทย', () => {
    expect(parseQuery('action=select_subitem&subTitle=' + encodeURIComponent('หน้าที่ 1'))).toEqual({
      action: 'select_subitem',
      subTitle: 'หน้าที่ 1',
    });
  });
});
