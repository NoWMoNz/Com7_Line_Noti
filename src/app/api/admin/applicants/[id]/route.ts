/** รายละเอียดผู้สมัคร + เอกสาร */
import { adminRoute } from '@/lib/admin/http';
import { getApplicantDetail } from '@/lib/admin/service';

export async function GET(_req: Request, ctx: RouteContext<'/api/admin/applicants/[id]'>) {
  const { id } = await ctx.params;
  return adminRoute(() => getApplicantDetail(id));
}
