/** ส่งแจ้งเตือนเริ่มงานทาง LINE (รายคน) */
import { adminRoute } from '@/lib/admin/http';
import { sendOnboarding } from '@/lib/admin/onboarding-service';

export async function POST(_req: Request, ctx: RouteContext<'/api/admin/onboarding/[id]/send'>) {
  const { id } = await ctx.params;
  return adminRoute((admin) => sendOnboarding(admin, id), 'onboarding');
}
