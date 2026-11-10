import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ตรวจลายเซ็น X-Line-Signature ว่า request มาจาก LINE จริง
 * (ระบบเดิมบน Apps Script ทำไม่ได้เพราะอ่าน header ไม่ได้ — ใครรู้ URL ก็ยิง event ปลอมได้)
 *
 * @param rawBody body ดิบ "ก่อน" parse JSON — ควรส่งเป็น byte ที่ได้รับมาตรงๆ (ไม่ decode/encode ใหม่)
 */
export function verifyLineSignature(rawBody: Uint8Array | string, signature: string | null, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
