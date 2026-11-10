/** ผู้ใช้แอดมิน: GET รายชื่อ / POST เพิ่มผู้ใช้ { email, fullName, role } → คืนลิงก์ตั้งรหัสผ่าน */
import { adminRoute, readBody } from '@/lib/admin/http';
import { inviteUser, listUsers } from '@/lib/admin/users-service';

export async function GET() {
  return adminRoute((admin) => listUsers(admin), 'users');
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const origin = new URL(request.url).origin;
  return adminRoute((admin) => inviteUser(admin, body, origin), 'users');
}
