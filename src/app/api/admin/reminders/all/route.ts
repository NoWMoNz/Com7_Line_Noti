/** เตือนทุกคนที่ยังส่งเอกสารไม่ครบทาง LINE */
import { adminDisplayName } from '@/lib/admin/auth';
import { adminRoute } from '@/lib/admin/http';
import { remindAllIncomplete } from '@/lib/reminders/service';

export const maxDuration = 300;

export async function POST() {
  return adminRoute((admin) => remindAllIncomplete(adminDisplayName(admin)), 'reminders');
}
