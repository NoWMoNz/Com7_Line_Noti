import { redirect } from 'next/navigation';

/**
 * หน้าแรก (/) ไม่มีเนื้อหาของตัวเอง
 * - มาจาก LINE / ลิงก์ผู้สมัคร (มี token, doc หรือ liff.state) → หน้าผู้สมัคร พร้อม query เดิม
 *   (กันกรณี Endpoint URL ของ LIFF ตั้งไว้ที่โดเมนเปล่าๆ)
 * - นอกนั้น → หน้าแอดมิน (ยังไม่ล็อกอินจะไปหน้าเข้าสู่ระบบเอง)
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, one);
  }
  if (q.has('token') || q.has('doc') || q.has('liff.state')) redirect(`/apply?${q}`);
  redirect('/admin');
}
