/** แก้ข้อมูลทั่วไปของผู้สมัคร (ส่งเฉพาะช่องที่แก้) */
import { updateApplicantByAdmin } from '@/lib/admin/applicant-admin-service';
import { adminRoute, readBody } from '@/lib/admin/http';
import type { ApplicantInfoInput } from '@/lib/admin/types';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/applicants/[id]/info'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute((admin) => updateApplicantByAdmin(admin, id, body as ApplicantInfoInput), 'applicants');
}
