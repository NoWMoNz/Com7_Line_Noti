/** เปลี่ยนชุดเอกสารที่ต้องส่ง: { scope: 'initial' | 'all', notify } */
import { adminRoute, readBody } from '@/lib/admin/http';
import { setDocScope } from '@/lib/admin/service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/applicants/[id]/doc-scope'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute((admin) => setDocScope(admin, id, body.scope, body.notify !== false), 'applicants');
}
