/**
 * ตรวจ ID token ที่หน้าเว็บได้จาก liff.getIDToken() กับ LINE
 * → ได้ LINE userId ที่เชื่อถือได้ (ห้ามเชื่อ userId ที่ browser ส่งมาเองตรงๆ เพราะปลอมได้)
 *
 * https://developers.line.biz/en/reference/line-login/#verify-id-token
 */
import { describeFetchError, fetchWithRetry } from './client';

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

export type IdTokenResult =
  | { ok: true; userId: string }
  /** token ไม่ถูกต้อง / หมดอายุ / ไม่ได้ออกให้ channel นี้ */
  | { ok: false; reason: 'invalid'; detail: string }
  /** ติดต่อ LINE ไม่ได้ — ให้ผู้ใช้ลองใหม่ */
  | { ok: false; reason: 'unavailable'; detail: string };

/**
 * Channel ID ที่ ID token ต้องออกให้
 * LIFF ID มีรูปแบบ "<channelId>-<สุ่ม>" จึงดึงจากตัวหน้าได้ — ตั้ง LINE_LOGIN_CHANNEL_ID เพื่อระบุเองได้
 */
export function channelIdFromLiffId(liffId: string): string {
  const m = /^(\d+)-[A-Za-z0-9]+$/.exec(liffId.trim());
  return m ? m[1] : '';
}

export async function verifyLineIdToken(idToken: string, channelId: string): Promise<IdTokenResult> {
  if (!idToken || !channelId) return { ok: false, reason: 'invalid', detail: 'missing id token or channel id' };

  let res: Response;
  try {
    res = await fetchWithRetry(
      VERIFY_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString(),
      },
      undefined,
      5000,
    );
  } catch (err) {
    return { ok: false, reason: 'unavailable', detail: describeFetchError(err) };
  }

  if (res.status >= 500) return { ok: false, reason: 'unavailable', detail: `LINE ${res.status}` };
  const body = (await res.json().catch(() => null)) as { sub?: string; error_description?: string } | null;
  if (!res.ok || !body?.sub) {
    return { ok: false, reason: 'invalid', detail: body?.error_description ?? `LINE ${res.status}` };
  }
  return { ok: true, userId: body.sub };
}
