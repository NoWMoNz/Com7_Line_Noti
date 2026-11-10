export type ReviewStatus = 'pending_review' | 'approved' | 'rejected';

export interface DocSubitem {
  title: string;
  optional: boolean;
}

export interface DocType {
  key: string;
  label: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
  /** ไม่บังคับส่ง — ไม่นับในความครบถ้วน */
  optional: boolean;
  /** ไฟล์รวม (all-in-one) ที่ครอบคลุมเอกสารอื่นทั้งหมด */
  coversAll: boolean;
  subitems: DocSubitem[];
}

/** ช่องไฟล์หนึ่งช่อง: เอกสารทั้งชิ้น (subitemTitle = '') หรือหัวข้อย่อย */
export interface FileSlotRef {
  docKey: string;
  subitemTitle: string;
}

export interface DocReview extends FileSlotRef {
  status: ReviewStatus;
  reason: string;
  reviewedBy: string | null;
  updatedAt: string | null;
}

export interface Applicant {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  approved: boolean;
  lineUserId: string | null;
  accessToken: string;
  /** ชุดเอกสารที่ล็อกไว้ (snapshot) — null = ใช้ชุดที่เปิดใช้งานปัจจุบัน */
  requiredDocKeys: string[] | null;
}
