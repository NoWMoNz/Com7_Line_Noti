import type { AdminResponse, ApplicantStage } from '@/lib/admin/types';

/** เรียก API แอดมิน — หมด session → พาไปหน้า login */
export async function adminFetch<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<AdminResponse<T>> {
  try {
    const res = await fetch(`/api/admin/${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 401) {
      window.location.replace('/admin/login');
      return { ok: false, error: 'กรุณาเข้าสู่ระบบ' };
    }
    const data = (await res.json().catch(() => null)) as AdminResponse<T> | null;
    return data ?? { ok: false, error: `ระบบขัดข้อง (${res.status})` };
  } catch {
    return { ok: false, error: 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต' };
  }
}

export const STAGE: Record<ApplicantStage, { label: string; tone: 'brand' | 'info' | 'warn' | 'danger' | 'muted' }> = {
  no_profile: { label: 'ยังไม่กรอกข้อมูล', tone: 'muted' },
  pending_approval: { label: 'รออนุมัติ', tone: 'warn' },
  review: { label: 'รอตรวจ', tone: 'info' },
  rejected: { label: 'รอผู้สมัครแก้', tone: 'danger' },
  missing: { label: 'รอส่งเอกสาร', tone: 'muted' },
  initial_complete: { label: 'เอกสารเบื้องต้นครบ', tone: 'brand' },
  complete: { label: 'เอกสารครบ', tone: 'brand' },
  onboarded: { label: 'แจ้งเริ่มงานแล้ว', tone: 'brand' },
  cancel: { label: 'Cancel', tone: 'muted' },
  turndown: { label: 'Turndown', tone: 'muted' },
};

/** ชื่อชุดเอกสาร */
export const DOC_SCOPE_LABEL = { initial: 'ส่งเบื้องต้น', all: 'ส่งทั้งหมด' } as const;

const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
const dateOnly = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });

export const fmtDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '-');

/** "5 นาทีที่แล้ว" / "เมื่อวาน" / "3 พ.ย." */
export function fmtRelative(iso: string | null): string {
  if (!iso) return '-';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'เมื่อสักครู่';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
  if (diff < 172800) return 'เมื่อวาน';
  return dateOnly.format(new Date(iso));
}

export function fmtSize(bytes: number | null): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
