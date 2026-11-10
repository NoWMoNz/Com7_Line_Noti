/** ข้อความถึงผู้สมัคร (แสดงบนหน้าผู้สมัคร และส่ง LINE ได้): { text, sendLine } */
import { adminRoute, readBody } from '@/lib/admin/http';
import { setFeedback } from '@/lib/admin/service';

export async function POST(request: Request, ctx: RouteContext<'/api/admin/applicants/[id]/feedback'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  return adminRoute((admin) => setFeedback(admin, id, body.text, body.sendLine === true), 'applicants');
}
