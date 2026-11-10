/**
 * เปิดหน้าผู้สมัคร: { token?, idToken? } → สถานะปัจจุบัน
 * idToken (จาก liff.getIDToken) ใช้ระบุบัญชี LINE — ถ้ามี จะตรวจกับ LINE ก่อนเชื่อ
 */
import { openSession } from '@/lib/apply/portal';
import { getPortalDeps, readJson, respond, str, verifiedLineUserId } from '@/lib/apply/server';

export async function POST(request: Request) {
  const body = await readJson(request);
  return respond(async () =>
    openSession({ token: str(body.token), lineUserId: await verifiedLineUserId(body.idToken) }, getPortalDeps()),
  );
}
