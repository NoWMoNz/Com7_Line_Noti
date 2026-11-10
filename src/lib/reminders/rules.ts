/**
 * กฎแจ้งเตือนเอกสารค้าง — ย้ายมาจาก Notifications.gs (sendLineReminder_, autoNotifyNearDeadline,
 * autoNotifyApplicantNoAction3Days) ไม่มีโค้ดฝั่ง server ทดสอบได้ตรงๆ
 */
import type { ApplicantDocSummary } from '@/lib/docs/status';
import { buildNotifyFlex } from '@/lib/line/flex';
import type { FlexBubble } from '@/lib/line/types';

const HOUR = 3600_000;
/** ใกล้กำหนดภายใน 48 ชม. หรือเลยแล้ว (โค้ดเดิมใช้ 48 แม้คอมเมนต์จะเขียน 24) */
export const DEADLINE_WINDOW_HOURS = 48;
/** ไม่ส่งเตือนกำหนดส่งซ้ำภายใน 20 ชม. */
export const DEADLINE_REPEAT_HOURS = 20;
export const FOLLOWUP_DAYS = 3;

/** ยังต้องเตือนไหม: มีเอกสารที่ยังไม่ส่ง/ส่งไม่ครบ/ถูกตีกลับ และยังไม่แจ้งเริ่มงาน */
export function needsReminder(summary: ApplicantDocSummary, onboarded: boolean): boolean {
  return !onboarded && !summary.allSatisfied && summary.actionable.length > 0;
}

export function shouldSendDeadlineReminder(deadline: string | null, lastNotifiedAt: string | null, now: number): boolean {
  if (!deadline) return false;
  const dl = new Date(deadline).getTime();
  if (Number.isNaN(dl)) return false;
  if ((dl - now) / HOUR > DEADLINE_WINDOW_HOURS) return false;
  if (lastNotifiedAt && now - new Date(lastNotifiedAt).getTime() < DEADLINE_REPEAT_HOURS * HOUR) return false;
  return true;
}

/**
 * ติดตามหลัง HR ตรวจ 3 วัน: ส่งครั้งเดียวต่อรอบการตรวจ (รอบใหม่เริ่มเมื่อ HR ตรวจอีกครั้ง)
 * และไม่ส่งถ้าผู้สมัครส่งไฟล์หลัง HR ตรวจแล้ว
 */
export function shouldSendFollowup(
  adminReviewedAt: string | null,
  lastUploadedAt: string | null,
  followupSentAt: string | null,
  now: number,
): boolean {
  if (!adminReviewedAt || followupSentAt) return false;
  const reviewed = new Date(adminReviewedAt).getTime();
  if (Number.isNaN(reviewed)) return false;
  if (lastUploadedAt && new Date(lastUploadedAt).getTime() > reviewed) return false;
  return now - reviewed >= FOLLOWUP_DAYS * 24 * HOUR;
}

/** รายการที่ยังขาด: "ชื่อ (คำอธิบาย)" เหมือนระบบเดิม */
export const missingLabels = (summary: ApplicantDocSummary) =>
  summary.actionable.map((s) => (s.doc.description ? `${s.doc.label} (${s.doc.description})` : s.doc.label));

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** "1 ธ.ค. 2569 (17:00 น.)" เวลาไทย */
export function formatDeadline(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * HOUR);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543} (${hh}:${mm} น.)`;
}

export function buildReminderBubble(opts: {
  name: string;
  missing: string[];
  deadline: string | null;
  feedback: string;
  link: string;
  logoUrl: string | null;
}): FlexBubble {
  const dl = opts.deadline ? formatDeadline(opts.deadline) : '';
  const fb = opts.feedback.trim();
  const note = dl && fb
    ? { label: `กรุณาส่งภายใน ${dl}`, text: `หมายเหตุจากเจ้าหน้าที่: "${fb}"`, tone: 'warn' as const }
    : dl
      ? { label: 'กรุณาส่งภายใน', text: dl, tone: 'warn' as const }
      : fb
        ? { label: 'หมายเหตุจากเจ้าหน้าที่', text: fb, tone: 'warn' as const }
        : undefined;
  return buildNotifyFlex({
    tone: 'warn',
    title: `ยังส่งเอกสารไม่ครบ (${opts.missing.length} รายการ)`,
    greeting: `สวัสดีค่ะคุณ${opts.name}\nระบบตรวจพบว่าคุณยังส่งเอกสารไม่ครบถ้วน`,
    list: { title: 'รายการที่ยังขาด', items: opts.missing },
    note,
    button: { label: 'ส่งเอกสารตอนนี้', uri: opts.link },
    logoUrl: opts.logoUrl,
  });
}

export function buildFollowupBubble(opts: { name: string; missing: string[]; feedback: string; link: string; logoUrl: string | null }): FlexBubble {
  const fb = opts.feedback.trim();
  return buildNotifyFlex({
    tone: 'warn',
    title: 'แจ้งเตือนการดำเนินการ',
    greeting: `สวัสดีค่ะคุณ${opts.name}\nเจ้าหน้าที่ได้ตรวจสอบเอกสารของคุณแล้ว`,
    list: { title: 'รายการที่ยังต้องดำเนินการ', items: opts.missing },
    note: fb
      ? { label: 'หมายเหตุจากเจ้าหน้าที่', text: fb, tone: 'warn' }
      : {
          label: 'กรุณาดำเนินการต่อ',
          text: 'เจ้าหน้าที่ได้ตรวจสอบเอกสารแล้ว แต่ระบบยังไม่พบการส่งเอกสารหรือการแก้ไขเพิ่มเติม กรุณาเข้าสู่ระบบเพื่อตรวจสอบรายการที่ต้องดำเนินการ',
          tone: 'warn',
        },
    button: { label: 'ดำเนินการต่อ', uri: opts.link },
    logoUrl: opts.logoUrl,
  });
}

/** สวิตช์งานอัตโนมัติ (เก็บใน settings) — ค่าเริ่มต้นปิด จนกว่า HR จะเปิด */
export const AUTO_REMINDERS_KEY = 'AUTO_REMINDERS';
export interface AutoReminderSettings {
  deadline: boolean;
  followup: boolean;
}
export function parseAutoSettings(v: unknown): AutoReminderSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { deadline: o.deadline === true, followup: o.followup === true };
}
