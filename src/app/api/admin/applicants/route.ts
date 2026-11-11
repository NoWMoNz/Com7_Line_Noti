/** รายชื่อผู้สมัคร: ?q=ค้นหา&filter=all|pending_approval|approved|closed&view=(มุมมองด่วน)&page=1 */
import { createApplicantByAdmin } from '@/lib/admin/applicant-admin-service';
import { adminRoute, readBody } from '@/lib/admin/http';
import { listApplicants } from '@/lib/admin/service';
import { APPLICANT_LIST_VIEWS, type ApplicantInfoInput, type ApplicantListFilter } from '@/lib/admin/types';

const FILTERS: ApplicantListFilter[] = ['all', 'pending_approval', 'approved', 'closed'];

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const filter = FILTERS.find((f) => f === p.get('filter')) ?? 'all';
  const view = APPLICANT_LIST_VIEWS.find((v) => v === p.get('view')) ?? null;
  return adminRoute(() => listApplicants({ q: p.get('q') ?? '', filter, view, page: Number(p.get('page') ?? 1) }), 'applicants');
}

/** HR เพิ่มผู้สมัครเอง: { name, phone?, branch?, notes?, deadline?, ta?, intern?, company?, position?, startDate? } */
export async function POST(request: Request) {
  const body = await readBody(request);
  return adminRoute((admin) => createApplicantByAdmin(admin, body as ApplicantInfoInput), 'applicants');
}
