/** แก้ไขผู้ใช้: { fullName?, role?, active? } */
import { adminRoute, readBody } from '@/lib/admin/http';
import { updateUser } from '@/lib/admin/users-service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/users/[id]'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute((admin) => updateUser(admin, id, body), 'users');
}
