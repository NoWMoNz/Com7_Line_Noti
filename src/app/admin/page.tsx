import type { Metadata } from 'next';
import { AdminApp } from './admin-app';
import { AdminShell } from './shell';

export const metadata: Metadata = { title: 'ผู้สมัคร - Com7 Recruitment', robots: { index: false, follow: false } };

/**
 * หน้าแอดมิน — หน้าเป็น static, ข้อมูลทั้งหมดโหลดผ่าน /api/admin/* ซึ่งตรวจสิทธิ์ทุกครั้ง
 * ยังไม่ login → API ตอบ 401 → พาไป /admin/login
 */
export default function AdminPage() {
  return (
    <AdminShell section="applicants">
      <AdminApp />
    </AdminShell>
  );
}
