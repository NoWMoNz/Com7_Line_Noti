/** ยกเลิกการผูก LINE (ผู้สมัครเปลี่ยนบัญชี LINE) */
import { adminRoute } from '@/lib/admin/http';
import { unlinkLine } from '@/lib/admin/service';

export async function POST(_req: Request, ctx: RouteContext<'/api/admin/applicants/[id]/unlink-line'>) {
  const { id } = await ctx.params;
  return adminRoute((admin) => unlinkLine(admin, id));
}
