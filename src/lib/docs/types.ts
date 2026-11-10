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
  /** ช่องอัปโหลดย่อย (เช่น หน้าที่ 1, 2, 3) — ว่าง = อัปโหลดได้หลายไฟล์ในช่องเดียว */
  subitems: DocSubitem[];
  /** จุดที่ HR ต้องตรวจในไฟล์ (เช่น เซ็นรับรอง) — ไม่ใช่ช่องอัปโหลด */
  checks: string[];
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
  /** ข้อความถึงผู้สมัครจากแอดมิน (แสดงบนหน้าผู้สมัคร) */
  adminFeedback: string;
  /** แอดมินแจ้งเริ่มงานแล้ว → ถือว่าเอกสารครบ */
  onboardNotified: boolean;
  pdpaVersion: string | null;
  pdpaAcceptedAt: string | null;
}
