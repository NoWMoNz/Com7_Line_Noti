/** ลบผู้ใช้ */
import { adminRoute } from '@/lib/admin/http';
import { deleteUser } from '@/lib/admin/users-service';

export async function POST(_req: Request, ctx: RouteContext<'/api/admin/users/[id]/delete'>) {
  const { id } = await ctx.params;
  return adminRoute((admin) => deleteUser(admin, id), 'users');
}
