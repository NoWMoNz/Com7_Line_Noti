/** เตือนผู้สมัครคนนี้ว่ายังส่งเอกสารไม่ครบ */
import { adminDisplayName } from '@/lib/admin/auth';
import { adminRoute } from '@/lib/admin/http';
import { AdminInputError } from '@/lib/admin/service';
import { remindOne } from '@/lib/reminders/service';

export async function POST(_req: Request, ctx: RouteContext<'/api/admin/applicants/[id]/remind'>) {
  const { id } = await ctx.params;
  return adminRoute(async (admin) => {
    const r = await remindOne(id, adminDisplayName(admin));
    if (!r.ok) throw new AdminInputError(r.error ?? 'ส่งไม่สำเร็จ');
    return r;
  }, 'reminders');
}
