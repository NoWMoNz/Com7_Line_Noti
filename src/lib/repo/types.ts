import type { Applicant, DocReview, DocType, FileSlotRef } from '@/lib/docs/types';

export interface SaveUploadInput {
  applicant: Applicant;
  docKey: string;
  subitemTitle: string;
  bytes: Uint8Array;
  mimeType: string;
  source: 'web' | 'line' | 'admin';
  /**
   * true (ค่าเริ่มต้น) = ไฟล์ใหม่แทนที่ไฟล์เดิมของช่องนี้
   * false = เพิ่มต่อจากไฟล์ที่มี (ใช้กับรูปที่ 2, 3, ... ที่ส่งมาพร้อมกันในชุดเดียว)
   */
  replaceExisting?: boolean;
}

export interface ApplicantPatch {
  name?: string;
  phone?: string;
  /** ผูก LINE — ใช้เฉพาะเมื่อแถวนี้ยังไม่มี line_user_id (ไม่เขียนทับของเดิม) */
  bindLineUserId?: string;
  /** บันทึกการยินยอม PDPA (เวลาปัจจุบัน + เวอร์ชัน + LINE ID ตอนกดยินยอม) */
  pdpa?: { version: string; lineUserId: string | null };
}

export interface NewApplicantInput {
  name: string;
  phone: string;
  lineUserId: string | null;
  pdpa: { version: string; lineUserId: string | null };
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
  findApplicantByToken(token: string): Promise<Applicant | null>;
  /** เบอร์ในฐานข้อมูลถูกจัดรูปแบบเป็น 0xxxxxxxxx แล้ว (ตอนย้ายข้อมูล / ลงทะเบียน) */
  findApplicantsByPhone(phone: string): Promise<Applicant[]>;
  createApplicant(input: NewApplicantInput): Promise<Applicant>;
  updateApplicant(id: string, patch: ApplicantPatch): Promise<Applicant>;
  /**
   * ส่งเอกสารครบ: ตั้ง completed_at (ถ้ายังไม่มี) และล็อกชุดเอกสาร required_doc_keys (ถ้ายังไม่มี)
   * — เพิ่มเอกสารใหม่ภายหลังจะไม่บังคับคนที่ส่งครบไปแล้ว
   */
  markCompleted(id: string, requiredDocKeys: string[]): Promise<void>;
  /** ประเภทเอกสารทั้งหมด (รวมที่ปิด) พร้อมหัวข้อย่อย เรียงตาม sortOrder */
  getDocTypes(): Promise<DocType[]>;
  getDocState(applicantId: string): Promise<{ files: FileSlotRef[]; reviews: DocReview[] }>;


  /**
   * เก็บไฟล์ + บันทึกแถวไฟล์ + แทนที่ไฟล์เดิมของช่องเดียวกัน
   * + ตั้งผลตรวจของเอกสาร (และหัวข้อย่อย) เป็น "รอตรวจ" + อัปเดต last_uploaded_at
   */
  saveUploadedFile(input: SaveUploadInput): Promise<void>;

  logActivity(input: ActivityLogInput): Promise<void>;
  logNotification(input: NotificationLogInput): Promise<void>;
}
