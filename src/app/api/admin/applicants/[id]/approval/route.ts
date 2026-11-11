/** อนุมัติ / ยกเลิกอนุมัติผู้สมัคร: { approved, notify, docScope? } — docScope = ชุดเอกสารที่ให้ส่ง (initial / all) */
import { adminRoute, readBody } from '@/lib/admin/http';
import { setApproval, setDocScope } from '@/lib/admin/service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/applicants/[id]/approval'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute(async (admin) => {
    if (body.approved === true && (body.docScope === 'initial' || body.docScope === 'all')) {
      await setDocScope(admin, id, body.docScope, false);
    }
    return setApproval(admin, id, body.approved === true, body.notify !== false);
  }, 'applicants');
}
