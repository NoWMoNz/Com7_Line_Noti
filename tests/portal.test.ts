import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptPdpa,
  openSession,
  register,
  sniffMime,
  uploadDocuments,
  type PortalDeps,
} from '@/lib/apply/portal';
import { PDPA_VERSION } from '@/lib/apply/pdpa';
import { createFakeLine, createMemoryRepo } from './memory';

const JPG = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = () => new TextEncoder().encode('%PDF-1.7 ...');
const PNG = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let mem: ReturnType<typeof createMemoryRepo>;
let fake: ReturnType<typeof createFakeLine>;
let deps: PortalDeps;

beforeEach(() => {
  mem = createMemoryRepo();
  fake = createFakeLine();
  deps = {
    repo: mem.repo,
    line: fake.line,
    config: { liffId: 'LIFF123', appBaseUrl: 'https://example.com', logoUrl: null, maxUploadBytes: 1024 * 1024 },
  };
});

/** ผู้สมัครที่ลงทะเบียน + ยินยอม + อนุมัติแล้ว */
const ready = (extra = {}) =>
  mem.add({
    name: 'สมชาย ใจดี',
    phone: '0812345678',
    lineUserId: 'U1',
    approved: true,
    pdpaVersion: PDPA_VERSION,
    pdpaAcceptedAt: '2026-01-01T00:00:00Z',
    ...extra,
  });

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe('openSession — ใครกำลังเปิดหน้า', () => {
  it('ไม่มี token และไม่ได้เปิดจาก LINE → หน้าลงทะเบียนว่าง', async () => {
    const s = await openSession({ token: null, lineUserId: null }, deps);
    expect(s).toMatchObject({ screen: 'register', token: null });
  });

  it('คนที่กด "ลงทะเบียน" ในแชทมาแล้ว (ยังไม่มีชื่อ) → หน้าลงทะเบียนพร้อม token', async () => {
    mem.add({ lineUserId: 'U1' });
    const s = await openSession({ token: null, lineUserId: 'U1' }, deps);
    expect(s).toMatchObject({ screen: 'register', token: 'tok1', personalLink: 'https://miniapp.line.me/LIFF123?token=tok1' });
  });

  it('เปิดลิงก์ของคนอื่นที่ผูก LINE ไว้แล้ว → ปฏิเสธ', async () => {
    ready();
    expect(await code(openSession({ token: 'tok1', lineUserId: 'U_other' }, deps))).toBe('line_mismatch');
  });

  it('token ที่ยังไม่ผูก LINE เปิดจาก LINE → ผูกให้', async () => {
    mem.add({ name: 'ก', phone: '0811111111' });
    await openSession({ token: 'tok1', lineUserId: 'U9' }, deps);
    expect(mem.applicants[0].lineUserId).toBe('U9');
  });

  it('เปิดนอก LINE ด้วย token → ใช้ได้ (เหมือนระบบเดิม) แต่ไม่ผูก LINE', async () => {
    ready();
    const s = await openSession({ token: 'tok1', lineUserId: null }, deps);
    expect(s.screen).toBe('docs');
  });

  it('ลำดับหน้าจอ: กรอกไม่ครบ → PDPA → รออนุมัติ → เอกสาร', async () => {
    const a = mem.add({ lineUserId: 'U1' });
    expect((await openSession({ token: 'tok1', lineUserId: null }, deps)).screen).toBe('register');
    Object.assign(a, { name: 'ก ข', phone: '0811111111' });
    expect((await openSession({ token: 'tok1', lineUserId: null }, deps)).screen).toBe('pdpa');
    Object.assign(a, { pdpaVersion: '0.9', pdpaAcceptedAt: '2025-01-01' });
    expect((await openSession({ token: 'tok1', lineUserId: null }, deps)).screen).toBe('pdpa');
    Object.assign(a, { pdpaVersion: PDPA_VERSION });
    expect((await openSession({ token: 'tok1', lineUserId: null }, deps)).screen).toBe('pending');
    a.approved = true;
    expect((await openSession({ token: 'tok1', lineUserId: null }, deps)).screen).toBe('docs');
  });
});

describe('register', () => {
  const form = { name: '  สมชาย   ใจดี ', phone: '081-234-5678', pdpaAccepted: true };

  it('คนใหม่จาก LINE → สร้างบัญชี + บันทึก PDPA + ส่งข้อความต้อนรับ', async () => {
    const s = await register({ token: null, lineUserId: 'U1', ...form }, deps);
    expect(s.screen).toBe('pending');
    expect(mem.applicants[0]).toMatchObject({ name: 'สมชาย ใจดี', phone: '0812345678', lineUserId: 'U1', pdpaVersion: PDPA_VERSION });
    expect(fake.pushes).toHaveLength(1);
    expect(mem.notifications).toEqual(['welcome']);
  });

  it('คนที่กดลงทะเบียนในแชทมาแล้ว → เติมข้อมูลแถวเดิม ไม่สร้างใหม่', async () => {
    mem.add({ lineUserId: 'U1' });
    await register({ token: 'tok1', lineUserId: 'U1', ...form }, deps);
    expect(mem.applicants).toHaveLength(1);
    expect(mem.applicants[0].name).toBe('สมชาย ใจดี');
  });

  it('เบอร์ตรงกับแถวที่ HR เพิ่มไว้ (ยังไม่มี LINE) + เปิดจาก LINE → ผูก LINE กับแถวนั้น', async () => {
    mem.add({ name: 'สมชาย', phone: '0812345678' });
    const s = await register({ token: null, lineUserId: 'U5', ...form }, deps);
    expect(mem.applicants).toHaveLength(1);
    expect(mem.applicants[0].lineUserId).toBe('U5');
    expect(s.token).toBe('tok1');
  });

  it('เบอร์ของคนที่ผูก LINE อื่นไว้ → ปฏิเสธ (ระบบเดิมยึดบัญชีได้)', async () => {
    ready();
    expect(await code(register({ token: null, lineUserId: 'U_attacker', ...form }, deps))).toBe('line_mismatch');
    expect(mem.applicants[0].lineUserId).toBe('U1');
  });

  it('ลงทะเบียนนอก LINE ด้วยเบอร์ที่มีในระบบ → ปฏิเสธ ไม่คืน token ของคนอื่น', async () => {
    mem.add({ name: 'สมชาย', phone: '0812345678' });
    expect(await code(register({ token: null, lineUserId: null, ...form }, deps))).toBe('not_allowed');
  });

  it('ลงทะเบียนนอก LINE เบอร์ใหม่ → สร้างบัญชีได้ (ไม่มีข้อความ LINE)', async () => {
    const s = await register({ token: null, lineUserId: null, ...form }, deps);
    expect(s.token).toBe('tok1');
    expect(fake.pushes).toHaveLength(0);
  });

  it('บัญชีที่กรอกครบแล้ว → ไม่เขียนทับชื่อ/เบอร์', async () => {
    ready();
    await register({ token: 'tok1', lineUserId: null, name: 'คนอื่น', phone: '0899999999', pdpaAccepted: true }, deps);
    expect(mem.applicants[0]).toMatchObject({ name: 'สมชาย ใจดี', phone: '0812345678' });
  });

  it.each([
    [{ name: '', phone: '0812345678', pdpaAccepted: true }],
    [{ name: 'สมชาย ใจดี', phone: '812345678', pdpaAccepted: true }],
    [{ name: 'สมชาย ใจดี', phone: '0812345678', pdpaAccepted: false }],
    [{ name: 'สมชาย ใจดี', phone: '0812345678', pdpaAccepted: 'true' }],
  ])('ข้อมูลไม่ครบ/ไม่ยินยอม → invalid_input %#', async (f) => {
    expect(await code(register({ token: null, lineUserId: 'U1', ...f }, deps))).toBe('invalid_input');
    expect(mem.applicants).toHaveLength(0);
  });
});

describe('acceptPdpa', () => {
  it('ผู้สมัครเดิมที่ยังไม่ยินยอม → บันทึกแล้วไปหน้าถัดไป', async () => {
    mem.add({ name: 'ก ข', phone: '0811111111', lineUserId: 'U1', approved: true });
    const s = await acceptPdpa({ token: 'tok1', lineUserId: 'U1' }, deps);
    expect(s.screen).toBe('docs');
    expect(mem.applicants[0].pdpaVersion).toBe(PDPA_VERSION);
  });

  it('token ผิด → not_found', async () => {
    expect(await code(acceptPdpa({ token: 'nope', lineUserId: null }, deps))).toBe('not_found');
  });
});

describe('uploadDocuments', () => {
  const up = (docKey: string, subitemTitle: string, files: Uint8Array[]) =>
    uploadDocuments({ token: 'tok1', docKey, subitemTitle, files: files.map((bytes) => ({ bytes })) }, deps);

  it('ยังไม่อนุมัติ → ปฏิเสธ', async () => {
    ready({ approved: false });
    expect(await code(up('doc9_health_receipt', '', [JPG()]))).toBe('not_allowed');
  });

  it('ส่งรูปหลายรูปของเอกสารชิ้นเดียว → เก็บครบทุกรูป (ไม่ทับกันเอง)', async () => {
    ready();
    const s = await up('doc9_health_receipt', '', [JPG(), PNG(), JPG()]);
    expect(mem.files.filter((f) => f.current)).toHaveLength(3);
    expect(s.docs?.required.find((d) => d.key === 'doc9_health_receipt')?.state).toBe('submitted');
  });

  it('ส่งชุดใหม่ → แทนที่ชุดเดิมทั้งหมด', async () => {
    ready();
    await up('doc9_health_receipt', '', [JPG(), JPG()]);
    await up('doc9_health_receipt', '', [PDF()]);
    expect(mem.files.filter((f) => f.current).map((f) => f.mimeType)).toEqual(['application/pdf']);
  });

  it('ชนิดไฟล์ดูจาก byte จริง — ไฟล์ปลอมนามสกุล → ปฏิเสธ', async () => {
    ready();
    expect(await code(up('doc9_health_receipt', '', [new TextEncoder().encode('<html>')]))).toBe('invalid_input');
  });

  it('หัวข้อย่อยแนบได้ 1 ไฟล์ / เอกสารที่มีหัวข้อย่อยต้องเลือกหัวข้อ / PDF ปนรูปไม่ได้', async () => {
    ready();
    expect(await code(up('doc1_application_set', 'ใบสมัครหน้าที่ 1', [JPG(), JPG()]))).toBe('invalid_input');
    expect(await code(up('doc1_application_set', '', [JPG()]))).toBe('invalid_input');
    expect(await code(up('doc1_application_set', 'ไม่มีหัวข้อนี้', [JPG()]))).toBe('invalid_input');
    expect(await code(up('doc9_health_receipt', '', [JPG(), PDF()]))).toBe('invalid_input');
  });

  it('ไฟล์ใหญ่เกินกำหนด → ปฏิเสธ', async () => {
    ready();
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(await code(up('doc9_health_receipt', '', [big]))).toBe('invalid_input');
  });

  it('เอกสารที่อนุมัติแล้ว → แนบใหม่ไม่ได้', async () => {
    const a = ready();
    mem.review(a.id, 'doc9_health_receipt', '', 'approved');
    expect(await code(up('doc9_health_receipt', '', [JPG()]))).toBe('not_allowed');
  });

  it('เอกสารที่ถูกตีกลับ → แนบใหม่ได้ และกลับเป็นรอตรวจ', async () => {
    const a = ready();
    await up('doc9_health_receipt', '', [JPG()]);
    mem.review(a.id, 'doc9_health_receipt', '', 'rejected', 'ภาพไม่ชัด');
    const s = await up('doc9_health_receipt', '', [JPG()]);
    expect(s.docs?.required.find((d) => d.key === 'doc9_health_receipt')?.state).toBe('submitted');
  });

  it('ส่งครบรายการสุดท้าย → แจ้ง LINE "ส่งครบ" ครั้งเดียว', async () => {
    ready();
    await up('doc1_application_set', 'ใบสมัครหน้าที่ 1', [JPG()]);
    await up('doc1_application_set', 'ใบสมัครหน้าที่ 2', [JPG()]);
    await up('doc1_application_set', 'ใบสมัครหน้าที่ 3', [JPG()]);
    await up('doc9_health_receipt', '', [JPG()]);
    expect(fake.pushes).toHaveLength(0);
    const s = await up('doc11_guarantor_copy', 'สำเนาบัตรประชาชน', [JPG()]);
    expect(s.docs?.allSatisfied).toBe(true);
    expect(fake.pushes).toHaveLength(1);
    await up('doc11_guarantor_copy', 'สลิปเงินเดือน (ถ้ามี)', [JPG()]);
    expect(fake.pushes).toHaveLength(1);
  });

  it('ไฟล์รวม (all-in-one) ครอบคลุมทุกเอกสาร', async () => {
    ready();
    const s = await up('doc0_all_in_one', '', [PDF()]);
    expect(s.docs?.allSatisfied).toBe(true);
    expect(s.docs?.allInOne?.state).toBe('submitted');
  });

  it('แจ้งเริ่มงานแล้ว → แสดงว่าอนุมัติครบ และแนบเพิ่มไม่ได้', async () => {
    ready({ onboardNotified: true });
    const s = await openSession({ token: 'tok1', lineUserId: null }, deps);
    expect(s.docs?.complete).toBe(true);
    expect(await code(up('doc9_health_receipt', '', [JPG()]))).toBe('not_allowed');
  });
});

describe('sniffMime', () => {
  it('รู้จัก JPG / PNG / WEBP / PDF', () => {
    expect(sniffMime(JPG())).toBe('image/jpeg');
    expect(sniffMime(PNG())).toBe('image/png');
    expect(sniffMime(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(PDF())).toBe('application/pdf');
    expect(sniffMime(new TextEncoder().encode('GIF89a'))).toBeNull();
  });
});
