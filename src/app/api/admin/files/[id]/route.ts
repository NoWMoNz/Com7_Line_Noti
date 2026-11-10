/**
 * เปิดไฟล์เอกสาร: ตรวจสิทธิ์แอดมิน แล้วพาไปลิงก์ชั่วคราว (หมดอายุ 2 นาที)
 * ไฟล์เก็บแบบ private — ไม่มีลิงก์ถาวรที่ส่งต่อแล้วเปิดได้เหมือน Drive ของระบบเดิม
 */
import { requireAdmin } from '@/lib/admin/auth';
import { errorResponse } from '@/lib/admin/http';
import { fileUrl } from '@/lib/admin/service';

export async function GET(_req: Request, ctx: RouteContext<'/api/admin/files/[id]'>) {
  const { id } = await ctx.params;
  try {
    await requireAdmin();
    return new Response(null, { status: 302, headers: { Location: await fileUrl(id), 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
