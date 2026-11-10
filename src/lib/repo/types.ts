import type { Applicant, DocReview, DocType, FileSlotRef } from '@/lib/docs/types';

export interface PendingUpload {
  docKey: string;
  subitemTitle: string;
}

export interface SaveUploadInput {
  applicant: Applicant;
  docKey: string;
  subitemTitle: string;
  bytes: Uint8Array;
  mimeType: string;
  source: 'web' | 'line' | 'admin';
}

export interface ActivityLogInput {
  actor: string;
  action: string;
  targetId?: string;
  targetName?: string;
  detail?: string;
}

export interface NotificationLogInput {
  type: string;
  applicant: Applicant;
  status: 'ok' | 'error';
  messagePreview: string;
  sentBy?: string;
  error?: string;
}

/**
 * การเข้าถึงข้อมูลที่ LINE bot ต้องใช้
 * ตัวจริงอยู่ที่ supabase.ts — แยกเป็น interface เพื่อให้ test ใช้ข้อมูลในหน่วยความจำแทนได้
 */
export interface Repo {
  findApplicantByLineId(lineUserId: string): Promise<Applicant | null>;
  createApplicantForLine(lineUserId: string): Promise<Applicant>;
  /** ประเภทเอกสารทั้งหมด (รวมที่ปิด) พร้อมหัวข้อย่อย เรียงตาม sortOrder */
  getDocTypes(): Promise<DocType[]>;
  getDocState(applicantId: string): Promise<{ files: FileSlotRef[]; reviews: DocReview[] }>;

  setPendingUpload(lineUserId: string, pending: PendingUpload, ttlSeconds: number): Promise<void>;
  getPendingUpload(lineUserId: string): Promise<PendingUpload | null>;
  clearPendingUpload(lineUserId: string): Promise<void>;

  /**
   * เก็บไฟล์ + บันทึกแถวไฟล์ + แทนที่ไฟล์เดิมของช่องเดียวกัน
   * + ตั้งผลตรวจของเอกสาร (และหัวข้อย่อย) เป็น "รอตรวจ" + อัปเดต last_uploaded_at
   */
  saveUploadedFile(input: SaveUploadInput): Promise<void>;

  logActivity(input: ActivityLogInput): Promise<void>;
  logNotification(input: NotificationLogInput): Promise<void>;
}
