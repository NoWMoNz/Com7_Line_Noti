import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyLineSignature } from '@/lib/line/signature';

const SECRET = 'test-channel-secret';
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('base64');

describe('verifyLineSignature', () => {
  const body = JSON.stringify({ events: [{ type: 'message', message: { text: 'สถานะ' } }] });

  it('ลายเซ็นถูกต้อง → ผ่าน', () => {
    expect(verifyLineSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('body ถูกแก้ / secret ผิด / ไม่มีลายเซ็น → ไม่ผ่าน', () => {
    expect(verifyLineSignature(body + ' ', sign(body), SECRET)).toBe(false);
    expect(verifyLineSignature(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyLineSignature(body, null, SECRET)).toBe(false);
    expect(verifyLineSignature(body, 'not-base64!!', SECRET)).toBe(false);
  });
});
