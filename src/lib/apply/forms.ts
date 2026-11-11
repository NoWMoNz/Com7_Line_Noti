/**
 * บริษัทที่รับสมัคร + แบบฟอร์มเอกสารสมัครงาน (PDF) ที่ผู้สมัครดาวน์โหลดไปปริ้นท์ กรอก แล้วถ่ายรูปส่งกลับ
 * แอดมินต้องเลือกบริษัทก่อนอนุมัติ → ผู้สมัครเห็นแบบฟอร์มของบริษัทนั้นฉบับเดียว
 * ไฟล์อยู่ใน public/forms — เปลี่ยนฉบับใหม่: วางไฟล์ใหม่แล้วแก้ path ด้านล่าง
 * (ใช้ได้ทั้งฝั่ง server และ browser)
 */

export const COMPANIES = ['Com7', 'Double7'] as const;
export type Company = (typeof COMPANIES)[number];

export interface ApplicationForm {
  /** ชื่อไฟล์ที่ผู้สมัครเห็น/ได้ตอนดาวน์โหลด */
  fileName: string;
  /** path บนเว็บนี้ เช่น /forms/com7-2026.pdf */
  url: string;
}

const FORMS: Record<Company, ApplicationForm> = {
  Com7: { fileName: 'ชุดเอกสารเริ่มงาน COM7 2026.pdf', url: '/forms/com7-2026.pdf' },
  Double7: { fileName: 'ชุดเอกสารเริ่มงาน Double7 2026.pdf', url: '/forms/double7-2026.pdf' },
};

/** ชื่อบริษัทที่พิมพ์มาหลายแบบ (COM7, Double 7, DB7) → ชื่อมาตรฐาน; ไม่รู้จัก → null */
export function normalizeCompany(raw: unknown): Company | null {
  const c = String(raw ?? '').toLowerCase().replace(/\s+/g, '');
  if (c.includes('double7') || c.includes('db7')) return 'Double7';
  if (c.includes('com7')) return 'Com7';
  return null;
}

/** แบบฟอร์มของบริษัทที่ผู้สมัครสังกัด — ยังไม่รู้บริษัท → null */
export function formForCompany(company: string): ApplicationForm | null {
  const c = normalizeCompany(company);
  return c ? FORMS[c] : null;
}
