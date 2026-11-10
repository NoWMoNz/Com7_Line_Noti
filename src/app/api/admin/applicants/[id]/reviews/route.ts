/** ตรวจเอกสาร: { items: [{ docKey, subitemTitle, status, reason }], notify } */
import { adminRoute, readBody } from '@/lib/admin/http';
import { reviewDocuments } from '@/lib/admin/service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/applicants/[id]/reviews'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute((admin) => reviewDocuments(admin, id, body.items, body.notify !== false));
}
