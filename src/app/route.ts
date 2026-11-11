/**
 * หน้าแรก (/) ไม่มีเนื้อหาของตัวเอง — redirect ตาม query
 * - มาจาก LINE / ลิงก์ผู้สมัคร (มี token, doc หรือ liff.state) → /apply พร้อม query เดิม
 *   (กันกรณี Endpoint URL ของ LIFF ตั้งไว้ที่โดเมนเปล่าๆ)
 * - นอกนั้น → /admin (ยังไม่ล็อกอินจะไปหน้าเข้าสู่ระบบเอง)
 *
 * ใช้ route handler แทน page: เปิด cacheComponents อยู่ page ที่อ่าน searchParams จะ prerender ไม่ผ่าน
 */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const q = url.searchParams;
  const toApply = q.has('token') || q.has('doc') || q.has('liff.state');
  const target = new URL(toApply ? `/apply${url.search}` : '/admin', url);
  return Response.redirect(target, 307);
}
