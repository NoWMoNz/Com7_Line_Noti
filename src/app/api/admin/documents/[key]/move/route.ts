/** เลื่อนลำดับเอกสาร: { direction: 'up' | 'down' } */
import { moveDocType } from '@/lib/admin/documents-service';
import { adminRoute, readBody } from '@/lib/admin/http';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/documents/[key]/move'>) {
  const { key } = await ctx.params;
  const body = await readBody(request);
  return adminRoute((admin) => moveDocType(admin, key, body.direction === 'up' ? 'up' : 'down'), 'documents');
}
