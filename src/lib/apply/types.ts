/**
 * ข้อมูลที่ server ส่งให้หน้าผู้สมัคร (/apply) — ใช้ร่วมกันทั้งฝั่ง server และ browser
 * (ห้าม import โค้ดฝั่ง server ในไฟล์นี้)
 */
import type { DocState, SubitemState } from '@/lib/docs/status';

/** หน้าจอที่ผู้สมัครควรเห็น เรียงตามลำดับขั้น */
export type ApplyScreen = 'register' | 'pdpa' | 'pending' | 'docs';

export interface SubitemView {
  title: string;
  optional: boolean;
  state: SubitemState;
  reason: string;
}

export interface DocItemView {
  key: string;
  label: string;
  description: string;
  /** 'missing' สำหรับไฟล์รวม/เอกสารไม่บังคับที่ยังไม่ส่ง */
  state: DocState;
  reason: string;
  subitems: SubitemView[];
  subDone: number;
  subRequired: number;
}

export interface DocsView {
  total: number;
  satisfiedCount: number;
  /** ส่งครบทุกรายการ (อาจยังรอตรวจ) */
  allSatisfied: boolean;
  /** แอดมินอนุมัติครบทุกรายการ หรือแจ้งเริ่มงานแล้ว */
  complete: boolean;
  allInOne: DocItemView | null;
  required: DocItemView[];
  optional: DocItemView[];
}

export interface ApplyState {
  screen: ApplyScreen;
  /** token ของลิงก์ส่วนตัว — null = ยังไม่มีบัญชี (หน้าลงทะเบียนครั้งแรก) */
  token: string | null;
  personalLink: string | null;
  name: string;
  phone: string;
  /** ข้อความจากแอดมิน */
  feedback: string;
  maxUploadMb: number;
  docs: DocsView | null;
}

export type ApplyResponse = { ok: true; state: ApplyState } | { ok: false; error: string; code?: ApplyErrorCode };

export type ApplyErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'line_mismatch'
  | 'line_auth'
  | 'not_allowed'
  | 'unavailable';
