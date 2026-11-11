/**
 * ข้อมูลที่ API แอดมินส่งให้หน้าเว็บ — ใช้ร่วมกันทั้ง server และ browser (ห้าม import โค้ดฝั่ง server)
 */
import type { DocState, SubitemState } from '@/lib/docs/status';
import type { ClosedStatus, DocScope, ReviewStatus } from '@/lib/docs/types';

export type AdminRole = 'Developer' | 'SuperAdmin' | 'Admin2' | 'Admin';

export interface AdminProfile {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
}

/** สถานะรวมของผู้สมัครในรายชื่อ — เรียงตามสิ่งที่ HR ต้องทำ */
export type ApplicantStage =
  | 'no_profile' // กดลงทะเบียนในแชทแล้ว แต่ยังไม่กรอกข้อมูล
  | 'pending_approval' // รอ HR อนุมัติ
  | 'rejected' // มีเอกสารต้องแก้ (รอผู้สมัคร)
  | 'review' // มีไฟล์รอ HR ตรวจ
  | 'missing' // รอผู้สมัครส่งเอกสาร
  | 'initial_complete' // อนุมัติเอกสารเบื้องต้นครบ (รอ HR ตัดสินใจให้ส่งทั้งหมด)
  | 'complete' // อนุมัติเอกสารครบ
  | 'onboarded' // แจ้งเริ่มงานแล้ว
  | ClosedStatus; // ปิดใบสมัครแล้ว: cancel / turndown

/** closed = แท็บ Cancel/Turndown (แท็บอื่นไม่แสดงคนที่ปิดใบสมัครแล้ว) */
export type ApplicantListFilter = 'all' | 'pending_approval' | 'approved' | 'closed';

/**
 * มุมมองด่วน (ตรงกับตัวเลขในหน้าภาพรวม) — ใช้แทนแท็บ ไม่รวมคนที่ปิดใบสมัครแล้ว
 *  no_profile = ยังไม่กรอกข้อมูล · review = มีไฟล์รอตรวจ · rejected = รอผู้สมัครแก้
 *  stale3d = ไม่ขยับเกิน 3 วัน · new7d = ลงทะเบียนใน 7 วัน
 */
export type ApplicantListView = 'no_profile' | 'review' | 'rejected' | 'stale3d' | 'new7d';
export const APPLICANT_LIST_VIEWS: ApplicantListView[] = ['review', 'rejected', 'stale3d', 'no_profile', 'new7d'];

export interface ApplicantListItem {
  id: string;
  code: string;
  name: string;
  phone: string;
  approved: boolean;
  lineLinked: boolean;
  stage: ApplicantStage;
  docScope: DocScope;
  /** เหตุผลที่ปิดใบสมัคร (เฉพาะ cancel / turndown) */
  closedReason: string;
  satisfied: number;
  total: number;
  /** จำนวนช่องที่รอ HR ตรวจ */
  pendingReview: number;
  createdAt: string;
  lastUploadedAt: string | null;
}

export interface ApplicantListResult {
  items: ApplicantListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** อนุมัติเอกสารครบ/แจ้งเริ่มงานแล้ว ที่ซ่อนจากรายชื่อนี้ (อยู่หน้าแจ้งเริ่มงาน) — 0 เมื่อค้นหา */
  movedToOnboarding: number;
}

export interface FileView {
  id: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  source: string;
  /** ไฟล์จากระบบเดิมที่ยังอยู่ใน Google Drive */
  legacy: boolean;
}

export interface ReviewView {
  status: ReviewStatus;
  reason: string;
  reviewedBy: string | null;
  updatedAt: string | null;
}

export interface AdminSubitemView {
  title: string;
  optional: boolean;
  state: SubitemState;
  review: ReviewView | null;
  files: FileView[];
}

export interface AdminDocView {
  key: string;
  label: string;
  description: string;
  optional: boolean;
  coversAll: boolean;
  state: DocState;
  reason: string;
  review: ReviewView | null;
  /** ไฟล์ของเอกสารทั้งชิ้น (ไม่ใช่หัวข้อย่อย) */
  files: FileView[];
  subitems: AdminSubitemView[];
  /** จุดที่ HR ต้องตรวจในไฟล์ (checklist) */
  checks: string[];
}

export interface ApplicantDetail {
  id: string;
  code: string;
  name: string;
  phone: string;
  approved: boolean;
  lineLinked: boolean;
  stage: ApplicantStage;
  docScope: DocScope;
  /** ปิดใบสมัครแล้ว — null = ยังดำเนินการอยู่ */
  closed: { status: ClosedStatus; reason: string; at: string | null; by: string | null } | null;
  feedback: string;
  pdpaVersion: string | null;
  pdpaAcceptedAt: string | null;
  onboardNotified: boolean;
  createdAt: string;
  lastUploadedAt: string | null;
  completedAt: string | null;
  info: ApplicantInfo;
  satisfied: number;
  total: number;
  docs: AdminDocView[];
}

/** ข้อมูลทั่วไปของผู้สมัครที่ HR แก้ได้ */
export interface ApplicantInfo {
  branch: string;
  notes: string;
  /** กำหนดส่งเอกสาร (ISO) — ใช้แจ้งเตือนใกล้ครบกำหนด */
  deadline: string | null;
  ta: string;
  intern: string;
  company: string;
  position: string;
  startDate: string | null;
}

export interface ApplicantInfoInput extends Partial<ApplicantInfo> {
  name?: string;
  phone?: string;
}

export interface ReviewItemInput {
  docKey: string;
  /** '' = ทั้งเอกสาร */
  subitemTitle: string;
  status: ReviewStatus;
  reason: string;
}

export type AdminResponse<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// แจ้งเริ่มงาน

export interface OnboardingItem {
  id: string;
  code: string;
  name: string;
  phone: string;
  branch: string;
  /** บริษัทที่บันทึกไว้ หรือหาจากสาขา (ใช้เลือกเทมเพลต) */
  company: string;
  position: string;
  startDate: string | null;
  salary: number | null;
  ta: string;
  notes: string;
  lineLinked: boolean;
  notifiedAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface OnboardingData {
  items: OnboardingItem[];
  templates: Record<string, { label: string; color: string; template: string }>;
}

export interface OnboardingInfoInput {
  name?: string;
  phone?: string;
  branch?: string;
  company?: string;
  position?: string;
  startDate?: string | null;
  salary?: number | null;
  ta?: string;
  notes?: string;
}

export interface BranchOption {
  id: number;
  label: string;
  company: string;
  shopCode: string;
  /** TA / Intern ประจำสาขา (จากตารางสาขา) — '' = ไม่ได้ระบุ */
  ta: string;
  intern: string;
}
