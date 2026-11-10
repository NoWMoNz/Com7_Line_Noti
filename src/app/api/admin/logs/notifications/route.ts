/** ประวัติการแจ้งเตือน LINE: ?page=&status=error */
import { adminRoute } from '@/lib/admin/http';
import { listNotifications } from '@/lib/admin/overview-service';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  return adminRoute(() => listNotifications({ page: Number(p.get('page') ?? 1), status: p.get('status') ?? undefined }), 'settings');
}
