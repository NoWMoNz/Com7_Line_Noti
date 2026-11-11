/** ปิดใบสมัคร / คืนสถานะ: { status: 'cancel' | 'turndown' | null, reason? } */
import { adminRoute, readBody } from '@/lib/admin/http';
import { setClosedStatus } from '@/lib/admin/service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/applicants/[id]/closed'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute((admin) => setClosedStatus(admin, id, body.status ?? null, body.reason), 'applicants');
}
