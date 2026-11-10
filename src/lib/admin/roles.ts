/**
 * สิทธิ์ตาม role — ย้ายมาจาก canAccessView (AdminDashboardCore.html) และ requireRole_ ของระบบเดิม
 * ใช้ทั้งฝั่ง server (บังคับจริง) และ browser (ซ่อนเมนู)
 *
 *  Developer   ทุกอย่าง
 *  SuperAdmin  ภาพรวม / ผู้สมัคร / แจ้งเริ่มงาน (แก้ไขหลังส่งได้) / สาขา / ผู้ใช้ / ตั้งค่า
 *  Admin2      ทุกหน้า ยกเว้น ผู้ใช้ / ตั้งค่า
 *  Admin       งานปฏิบัติการ: ผู้สมัคร / แจ้งเริ่มงาน (แก้ไขข้อมูลได้ แต่ส่งไม่ได้) / สาขา / เอกสาร
 */
import type { AdminRole } from './types';

export type AdminSection = 'overview' | 'applicants' | 'onboarding' | 'branches' | 'documents' | 'users' | 'settings';

const SECTIONS: Record<AdminRole, AdminSection[]> = {
  Developer: ['overview', 'applicants', 'onboarding', 'branches', 'documents', 'users', 'settings'],
  SuperAdmin: ['overview', 'applicants', 'onboarding', 'branches', 'users', 'settings'],
  Admin2: ['overview', 'applicants', 'onboarding', 'branches', 'documents'],
  Admin: ['applicants', 'onboarding', 'branches', 'documents'],
};

export const canAccess = (role: AdminRole, section: AdminSection) => SECTIONS[role].includes(section);

/** ส่งแจ้งเตือนเริ่มงาน — Admin ทั่วไปส่งไม่ได้ */
export const canSendOnboarding = (role: AdminRole) => role !== 'Admin';

/** แก้ข้อมูลเริ่มงานหลังส่งแจ้งเตือนแล้ว */
export const canEditAfterOnboard = (role: AdminRole) => role === 'SuperAdmin' || role === 'Developer';

/** จัดการผู้ใช้: SuperAdmin แตะบัญชี/role Developer ไม่ได้ */
export function canManageUser(actor: AdminRole, targetRole: AdminRole): boolean {
  if (actor === 'Developer') return true;
  if (actor === 'SuperAdmin') return targetRole !== 'Developer';
  return false;
}
