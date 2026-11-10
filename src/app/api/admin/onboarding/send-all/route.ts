/** ส่งแจ้งเตือนเริ่มงานทุกคนที่ยังไม่ได้ส่งและข้อมูลครบ */
import { adminRoute } from '@/lib/admin/http';
import { sendOnboardingAll } from '@/lib/admin/onboarding-service';

export const maxDuration = 300;

export async function POST() {
  return adminRoute((admin) => sendOnboardingAll(admin), 'onboarding');
}
