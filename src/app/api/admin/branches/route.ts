/** สาขา: GET รายการทั้งหมด / POST เพิ่มหรือแก้ไข (มี id = แก้ไข) */
import { adminRoute, readBody } from '@/lib/admin/http';
import { listBranches, saveBranch, type BranchInput } from '@/lib/admin/branches-service';

export async function GET() {
  return adminRoute(() => listBranches(), 'branches');
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const id = Number(body.id);
  return adminRoute((admin) => saveBranch(admin, { ...(body as Partial<BranchInput>), id: id > 0 ? id : undefined }), 'branches');
}
