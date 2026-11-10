/** บันทึกเทมเพลตข้อความแจ้งเริ่มงาน: { templates } */
import { adminRoute, readBody } from '@/lib/admin/http';
import { saveTemplates } from '@/lib/admin/onboarding-service';

export async function POST(request: Request) {
  const body = await readBody(request);
  return adminRoute((admin) => saveTemplates(admin, body.templates), 'onboarding');
}
