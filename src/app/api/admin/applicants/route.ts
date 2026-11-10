/** รายชื่อผู้สมัคร: ?q=ค้นหา&filter=all|pending_approval|approved&page=1 */
import { adminRoute } from '@/lib/admin/http';
import { listApplicants } from '@/lib/admin/service';
import type { ApplicantListFilter } from '@/lib/admin/types';

const FILTERS: ApplicantListFilter[] = ['all', 'pending_approval', 'approved'];

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const filter = FILTERS.find((f) => f === p.get('filter')) ?? 'all';
  return adminRoute(() => listApplicants({ q: p.get('q') ?? '', filter, page: Number(p.get('page') ?? 1) }));
}
