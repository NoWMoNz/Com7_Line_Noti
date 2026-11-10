/** ลบผู้สมัครถาวร (รวมไฟล์เอกสาร) — ต้องส่ง { confirmCode } ตรงกับรหัสผู้สมัคร */
import { deleteApplicantByAdmin } from '@/lib/admin/applicant-admin-service';
import { adminRoute, readBody } from '@/lib/admin/http';
import { AdminInputError, getApplicantDetail } from '@/lib/admin/service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/applicants/[id]/delete'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute(async (admin) => {
    const current = await getApplicantDetail(id);
    if (String(body.confirmCode ?? '').trim() !== current.code) throw new AdminInputError('รหัสยืนยันไม่ตรงกับรหัสผู้สมัคร');
    return deleteApplicantByAdmin(admin, id);
  }, 'applicants');
}
