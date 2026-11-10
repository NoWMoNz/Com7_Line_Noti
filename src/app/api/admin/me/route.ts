/** แอดมินที่ login อยู่ */
import { adminRoute } from '@/lib/admin/http';

export async function GET() {
  return adminRoute(async (admin) => admin);
}
