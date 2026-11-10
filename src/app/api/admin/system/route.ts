/** สถานะการเชื่อมต่อ LINE / Storage */
import { adminRoute } from '@/lib/admin/http';
import { getSystemStatus } from '@/lib/admin/overview-service';

export async function GET() {
  return adminRoute(() => getSystemStatus(), 'settings');
}
