/** อนุมัติ / ยกเลิกอนุมัติผู้สมัคร: { approved, notify } */
import { adminRoute, readBody } from '@/lib/admin/http';
import { setApproval } from '@/lib/admin/service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/applicants/[id]/approval'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute((admin) => setApproval(admin, id, body.approved === true, body.notify !== false));
}
