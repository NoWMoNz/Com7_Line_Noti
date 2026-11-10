import 'server-only';
/** ส่งแจ้งเตือนเอกสารค้าง — กดเองจากหน้าแอดมิน และงานอัตโนมัติรายวัน (Vercel Cron) */
import { selectForApplicants } from '@/lib/admin/fetch-all';
import { requiredDocsFor, summarizeApplicantDocs, type ApplicantDocSummary } from '@/lib/docs/status';
import type { ReviewStatus } from '@/lib/docs/types';
import { serverEnv } from '@/lib/env';
import { createLineClient } from '@/lib/line/client';
import { DEFAULT_LOGO_URL } from '@/lib/line/flex';
import { buildAppLink } from '@/lib/line/handler';
import { createSupabaseRepo } from '@/lib/repo/supabase';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  AUTO_REMINDERS_KEY,
  buildFollowupBubble,
  buildReminderBubble,
  missingLabels,
  needsReminder,
  parseAutoSettings,
  shouldSendDeadlineReminder,
  shouldSendFollowup,
  type AutoReminderSettings,
} from './rules';

const db = () => getSupabaseAdmin();

interface Candidate {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  line_user_id: string;
  access_token: string;
  admin_feedback: string | null;
  deadline: string | null;
  last_notified_at: string | null;
  last_uploaded_at: string | null;
  admin_reviewed_at: string | null;
  followup_sent_at: string | null;
  required_doc_keys: string[] | null;
  summary: ApplicantDocSummary;
}

/** ผู้สมัครที่อนุมัติแล้ว มี LINE ยังไม่แจ้งเริ่มงาน และยังมีเอกสารที่ต้องทำ */
async function loadCandidates(onlyIds?: string[]): Promise<Candidate[]> {
  const rows: Omit<Candidate, 'summary'>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db()
      .from('applicants')
      .select('id, code, name, phone, line_user_id, access_token, admin_feedback, deadline, last_notified_at, last_uploaded_at, admin_reviewed_at, followup_sent_at, required_doc_keys')
      .eq('approved', true)
      .not('line_user_id', 'is', null)
      .is('onboard_notified_at', null)
      .order('id')
      .range(from, from + 999);
    if (onlyIds) q = q.in('id', onlyIds);
    const res = await q;
    if (res.error) throw new Error(res.error.message);
    rows.push(...(res.data as Omit<Candidate, 'summary'>[]));
    if (res.data.length < 1000) break;
  }
  const ids = rows.map((r) => r.id);
  type FileRow = { applicant_id: string; doc_key: string; subitem_title: string };
  const [allDocs, files, reviews] = await Promise.all([
    createSupabaseRepo(db()).getDocTypes(),
    selectForApplicants<FileRow>(db(), 'applicant_files', 'applicant_id, doc_key, subitem_title', ids, { currentOnly: true }),
    selectForApplicants<FileRow & { status: ReviewStatus; reason: string }>(db(), 'doc_reviews', 'applicant_id, doc_key, subitem_title, status, reason', ids),
  ]);
  return rows
    .map((r) => ({
      ...r,
      summary: summarizeApplicantDocs(
        requiredDocsFor(r.required_doc_keys, allDocs),
        files.filter((f) => f.applicant_id === r.id).map((f) => ({ docKey: f.doc_key, subitemTitle: f.subitem_title })),
        reviews
          .filter((x) => x.applicant_id === r.id)
          .map((x) => ({ docKey: x.doc_key, subitemTitle: x.subitem_title, status: x.status, reason: x.reason, reviewedBy: null, updatedAt: null })),
      ),
    }))
    .filter((c) => needsReminder(c.summary, false));
}

function ctx() {
  return {
    line: createLineClient(serverEnv.lineChannelAccessToken()),
    logoUrl: serverEnv.lineLogoUrl() || DEFAULT_LOGO_URL,
    // ไม่แนบ token — หน้าส่งเอกสารรู้ว่าเป็นใครจากบัญชี LINE
    link: () => buildAppLink({ liffId: serverEnv.liffId(), appBaseUrl: serverEnv.appBaseUrl(), logoUrl: null, maxUploadBytes: 0 }),
  };
}

export interface SendResult {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
}

async function push(c: Candidate, kind: 'doc_reminder' | 'auto_deadline' | '3day_no_action_followup', sentBy: string): Promise<SendResult> {
  const { line, logoUrl, link } = ctx();
  const missing = missingLabels(c.summary);
  const followup = kind === '3day_no_action_followup';
  const bubble = followup
    ? buildFollowupBubble({ name: c.name, missing, feedback: c.admin_feedback ?? '', link: link(), logoUrl })
    : buildReminderBubble({ name: c.name, missing, deadline: c.deadline, feedback: c.admin_feedback ?? '', link: link(), logoUrl });
  const altText = followup ? `แจ้งเตือนคุณ${c.name} กรุณาดำเนินการส่งเอกสาร` : `คุณ${c.name} ยังส่งเอกสารไม่ครบ (${missing.length} รายการ)`;
  const ok = await line.push(c.line_user_id, [{ type: 'flex', altText, contents: bubble }]).catch(() => false);

  await db().from('notification_log').insert({
    type: kind,
    applicant_id: c.id,
    applicant_name: c.name,
    phone: c.phone,
    sent_by: sentBy,
    status: ok ? 'ok' : 'error',
    message_preview: altText.slice(0, 200),
    error: ok ? null : 'push failed',
  });
  if (ok) {
    const now = new Date().toISOString();
    await db()
      .from('applicants')
      .update(followup ? { followup_sent_at: now, followup_status: 'sent' } : { last_notified_at: now })
      .eq('id', c.id);
  }
  return { id: c.id, name: c.name, ok, ...(ok ? {} : { error: 'ส่ง LINE ไม่สำเร็จ' }) };
}

/** เตือนรายคน (ปุ่มในหน้ารายละเอียด) */
export async function remindOne(id: string, sentBy: string): Promise<SendResult> {
  const [c] = await loadCandidates([id]);
  if (!c) return { id, name: '', ok: false, error: 'ไม่ต้องเตือน: ยังไม่อนุมัติ / ไม่มี LINE / ส่งครบแล้ว / แจ้งเริ่มงานแล้ว' };
  return push(c, 'doc_reminder', sentBy);
}

/** เตือนทุกคนที่ยังส่งไม่ครบ (admin_notifyAllIncomplete เดิม) */
export async function remindAllIncomplete(sentBy: string): Promise<{ sent: number; total: number; failed: SendResult[] }> {
  const list = await loadCandidates();
  const results: SendResult[] = [];
  for (const c of list) results.push(await push(c, 'doc_reminder', sentBy));
  return { sent: results.filter((r) => r.ok).length, total: list.length, failed: results.filter((r) => !r.ok) };
}

export async function getAutoSettings(): Promise<AutoReminderSettings> {
  const res = await db().from('settings').select('value').eq('key', AUTO_REMINDERS_KEY).maybeSingle();
  return parseAutoSettings(res.data?.value);
}

export async function saveAutoSettings(v: AutoReminderSettings): Promise<AutoReminderSettings> {
  const clean = parseAutoSettings(v);
  const res = await db().from('settings').upsert({ key: AUTO_REMINDERS_KEY, value: clean });
  if (res.error) throw new Error(res.error.message);
  return clean;
}

/** งานรายวัน: เตือนใกล้กำหนดส่ง + ติดตาม 3 วันหลัง HR ตรวจ (ทำเฉพาะงานที่เปิดไว้) */
export async function runDailyReminders(now = Date.now()) {
  const settings = await getAutoSettings();
  if (!settings.deadline && !settings.followup) return { settings, deadline: [], followup: [] };
  const list = await loadCandidates();
  const deadline: SendResult[] = [];
  const followup: SendResult[] = [];
  for (const c of list) {
    if (settings.deadline && shouldSendDeadlineReminder(c.deadline, c.last_notified_at, now)) {
      deadline.push(await push(c, 'auto_deadline', 'AutoTrigger'));
    }
    if (settings.followup && shouldSendFollowup(c.admin_reviewed_at, c.last_uploaded_at, c.followup_sent_at, now)) {
      followup.push(await push(c, '3day_no_action_followup', 'AutoTrigger'));
    }
  }
  return { settings, deadline, followup };
}
