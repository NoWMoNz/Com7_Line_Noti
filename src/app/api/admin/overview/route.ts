/** ภาพรวม: งานที่ต้องทำ + แจ้งเตือนล่าสุด */
import { adminRoute } from '@/lib/admin/http';
import { getOverview } from '@/lib/admin/overview-service';

export async function GET() {
  return adminRoute(() => getOverview(), 'overview');
}
