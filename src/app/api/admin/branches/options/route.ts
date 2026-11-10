/** รายชื่อสาขาสำหรับช่องเลือกสาขา */
import { adminRoute } from '@/lib/admin/http';
import { branchOptions } from '@/lib/admin/onboarding-service';

export async function GET() {
  return adminRoute(() => branchOptions());
}
