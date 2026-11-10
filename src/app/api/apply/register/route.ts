/** ลงทะเบียน + ยินยอม PDPA: { token?, idToken?, name, phone, pdpaAccepted } */
import { register } from '@/lib/apply/portal';
import { getPortalDeps, readJson, respond, str, verifiedLineUserId } from '@/lib/apply/server';

export async function POST(request: Request) {
  const body = await readJson(request);
  return respond(async () =>
    register(
      {
        token: str(body.token),
        lineUserId: await verifiedLineUserId(body.idToken),
        name: body.name,
        phone: body.phone,
        pdpaAccepted: body.pdpaAccepted,
      },
      getPortalDeps(),
    ),
  );
}
