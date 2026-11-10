/** ลบสาขา */
import { adminRoute } from '@/lib/admin/http';
import { deleteBranch } from '@/lib/admin/branches-service';
import { AdminInputError } from '@/lib/admin/service';

export async function POST(_req: Request, ctx: RouteContext<'/api/admin/branches/[id]/delete'>) {
  const { id } = await ctx.params;
  return adminRoute(async (admin) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw new AdminInputError('รหัสสาขาไม่ถูกต้อง');
    return deleteBranch(admin, n);
  }, 'branches');
}
