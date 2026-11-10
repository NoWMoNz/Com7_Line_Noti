import type { Metadata } from 'next';
import { ApplyApp } from './apply-app';

export const metadata: Metadata = {
  title: 'ส่งเอกสารสมัครงาน - Com7',
  robots: { index: false, follow: false },
};

/**
 * Endpoint URL ของ LINE MINI App: https://<โดเมน>/apply
 * หน้านี้เป็น static ทั้งหมด — ข้อมูลผู้สมัครโหลดฝั่ง browser หลังเริ่ม LIFF (ดู apply-app.tsx)
 */
export default function ApplyPage() {
  return <ApplyApp liffId={process.env.NEXT_PUBLIC_LIFF_ID ?? ''} />;
}
