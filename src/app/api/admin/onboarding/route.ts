/** รายชื่อแจ้งเริ่มงาน + เทมเพลต */
import { adminRoute } from '@/lib/admin/http';
import { listOnboarding } from '@/lib/admin/onboarding-service';

export async function GET() {
  return adminRoute(() => listOnboarding(), 'onboarding');
}
