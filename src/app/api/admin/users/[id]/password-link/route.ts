/** ออกลิงก์ตั้งรหัสผ่านใหม่ (ใช้ครั้งเดียว) ให้ส่งต่อเจ้าของบัญชี */
import { adminRoute } from '@/lib/admin/http';
import { newPasswordLink } from '@/lib/admin/users-service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/users/[id]/password-link'>) {
  const { id } = await ctx.params;
  const origin = new URL(request.url).origin;
  return adminRoute((admin) => newPasswordLink(admin, id, origin), 'users');
}
