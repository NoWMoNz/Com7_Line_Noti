/** ผู้สมัครเดิมยินยอม PDPA (ยังไม่เคยยินยอม หรือนโยบายเปลี่ยนเวอร์ชัน): { token, idToken? } */
import { acceptPdpa } from '@/lib/apply/portal';
import { getPortalDeps, readJson, respond, str, verifiedLineUserId } from '@/lib/apply/server';

export async function POST(request: Request) {
  const body = await readJson(request);
  return respond(async () =>
    acceptPdpa({ token: str(body.token), lineUserId: await verifiedLineUserId(body.idToken) }, getPortalDeps()),
  );
}
