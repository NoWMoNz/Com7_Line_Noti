/** Audit log: ?page=&q= */
import { adminRoute } from '@/lib/admin/http';
import { listAudit } from '@/lib/admin/overview-service';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  return adminRoute(() => listAudit({ page: Number(p.get('page') ?? 1), q: p.get('q') ?? '' }), 'settings');
}
