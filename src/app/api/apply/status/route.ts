/** โหลดสถานะใหม่ (ปุ่ม "เช็คสถานะอีกครั้ง"): { token } */
import { getState } from '@/lib/apply/portal';
import { getPortalDeps, readJson, respond, str } from '@/lib/apply/server';

export async function POST(request: Request) {
  const body = await readJson(request);
  return respond(() => getState(str(body.token), getPortalDeps()));
}
