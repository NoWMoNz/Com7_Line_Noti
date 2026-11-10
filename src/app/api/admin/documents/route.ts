/** ประเภทเอกสาร: GET รายการ / POST เพิ่มหรือแก้ไข (มี key = แก้ไข) */
import { listDocTypes, saveDocType, type DocTypeInput } from '@/lib/admin/documents-service';
import { adminRoute, readBody } from '@/lib/admin/http';

export async function GET() {
  return adminRoute(() => listDocTypes(), 'documents');
}

export async function POST(request: Request) {
  const body = await readBody(request);
  return adminRoute((admin) => saveDocType(admin, body as DocTypeInput), 'documents');
}
