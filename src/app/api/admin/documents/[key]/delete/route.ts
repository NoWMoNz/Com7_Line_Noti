/** ลบประเภทเอกสาร (เฉพาะที่ยังไม่มีไฟล์) */
import { deleteDocType } from '@/lib/admin/documents-service';
import { adminRoute } from '@/lib/admin/http';

export async function POST(_req: Request, ctx: RouteContext<'/api/admin/documents/[key]/delete'>) {
  const { key } = await ctx.params;
  return adminRoute((admin) => deleteDocType(admin, key), 'documents');
}
