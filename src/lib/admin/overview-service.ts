import 'server-only';
/**
 * ภาพรวม (งานที่ต้องทำ) + ประวัติแจ้งเตือน / audit log + สถานะระบบ
 * นับจากคอลัมน์และผลตรวจโดยตรง (ไม่คำนวณสถานะเอกสารทีละคน) เพื่อให้เร็วแม้มีผู้สมัครหลายพันคน
 */
import { serverEnv } from '@/lib/env';
import { applicantIdsWithReview } from '@/lib/admin/fetch-all';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const db = () => getSupabaseAdmin();
const DAY = 86_400_000;

const countQuery = () => db().from('applicants').select('id', { count: 'exact', head: true });
type CountQuery = ReturnType<typeof countQuery>;

/** จำนวนผู้สมัครตามเงื่อนไข (ไม่ดึงแถวมา) — ไม่นับคนที่ปิดใบสมัครแล้ว (Cancel/Turndown) ยกเว้นระบุ includeClosed */
async function count(build: (q: CountQuery) => CountQuery, includeClosed = false) {
  const base = countQuery();
  const res = await build(includeClosed ? base : base.is('closed_status', null));
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}

export interface Overview {
  total: number;
  noProfile: number;
  pendingApproval: number;
  waitingReview: number;
  /** รอตรวจ แยกตามอายุ (นับจากส่งล่าสุด) */
  reviewAging: { under1d: number; d1to3: number; over3d: number };
  waitingApplicantFix: number;
  submittedAll: number;
  onboarded: number;
  stale3d: number;
  newLast7d: number;
  /** ปิดใบสมัครแล้ว (Cancel / Turndown) */
  closed: number;
  recentNotifications: NotificationRow[];
}

export interface NotificationRow {
  id: number;
  createdAt: string;
  type: string;
  applicantName: string | null;
  sentBy: string;
  status: string;
  preview: string | null;
  error: string | null;
}

export async function getOverview(): Promise<Overview> {
  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * DAY).toISOString();
  const weekAgo = new Date(now - 7 * DAY).toISOString();

  const [total, noProfile, pendingApproval, submittedAll, onboarded, stale3d, newLast7d, closed, pending, rejected, notifications] = await Promise.all([
    count((q) => q),
    count((q) => q.or('name.eq.,phone.is.null')),
    count((q) => q.eq('approved', false).neq('name', '').not('phone', 'is', null)),
    count((q) => q.eq('approved', true).not('completed_at', 'is', null).is('onboard_notified_at', null)),
    count((q) => q.not('onboard_notified_at', 'is', null)),
    // อนุมัติแล้ว ยังส่งไม่ครบ และไม่มีความเคลื่อนไหว 3 วัน
    count((q) =>
      q
        .eq('approved', true)
        .is('completed_at', null)
        .is('onboard_notified_at', null)
        .or(`last_uploaded_at.lt.${threeDaysAgo},and(last_uploaded_at.is.null,created_at.lt.${threeDaysAgo})`),
    ),
    count((q) => q.gte('created_at', weekAgo)),
    count((q) => q.not('closed_status', 'is', null), true),
    applicantIdsWithReview(db(), 'pending_review'),
    applicantIdsWithReview(db(), 'rejected'),
    listNotifications({ page: 1, pageSize: 8 }),
  ]);

  // อายุของงานรอตรวจ: ดูเวลาส่งล่าสุดของผู้สมัครที่ยังมีไฟล์รอตรวจ
  // นับเฉพาะคนที่อนุมัติแล้ว ยังไม่แจ้งเริ่มงาน และยังไม่ปิดใบสมัคร (ใช้กับ "รอผู้สมัครแก้" ด้วย)
  const aging = { under1d: 0, d1to3: 0, over3d: 0 };
  const allIds = [...new Set([...pending, ...rejected])];
  for (let i = 0; i < allIds.length; i += 80) {
    const res = await db()
      .from('applicants')
      .select('id, last_uploaded_at, approved, onboard_notified_at, closed_status')
      .in('id', allIds.slice(i, i + 80));
    if (res.error) throw new Error(res.error.message);
    for (const a of res.data as Array<{
      id: string;
      last_uploaded_at: string | null;
      approved: boolean;
      onboard_notified_at: string | null;
      closed_status: string | null;
    }>) {
      if (!a.approved || a.onboard_notified_at || a.closed_status) {
        pending.delete(a.id);
        rejected.delete(a.id);
        continue;
      }
      if (!pending.has(a.id)) continue;
      const age = now - new Date(a.last_uploaded_at ?? 0).getTime();
      if (age < DAY) aging.under1d++;
      else if (age < 3 * DAY) aging.d1to3++;
      else aging.over3d++;
    }
  }

  return {
    total,
    noProfile,
    pendingApproval,
    waitingReview: pending.size,
    reviewAging: aging,
    waitingApplicantFix: rejected.size,
    submittedAll,
    onboarded,
    stale3d,
    newLast7d,
    closed,
    recentNotifications: notifications.items,
  };
}

// ---------------------------------------------------------------------------
// ประวัติ

export async function listNotifications(opts: { page: number; pageSize?: number; status?: string }) {
  const size = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page || 1);
  let q = db()
    .from('notification_log')
    .select('id, created_at, type, applicant_name, sent_by, status, message_preview, error', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (opts.status === 'error') q = q.neq('status', 'ok');
  const res = await q;
  if (res.error) throw new Error(res.error.message);
  const items: NotificationRow[] = (res.data as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    createdAt: r.created_at as string,
    type: r.type as string,
    applicantName: r.applicant_name as string | null,
    sentBy: r.sent_by as string,
    status: r.status as string,
    preview: r.message_preview as string | null,
    error: r.error as string | null,
  }));
  return { items, total: res.count ?? items.length, page, pageSize: size };
}

export interface AuditRow {
  id: number;
  createdAt: string;
  kind: string;
  actor: string;
  action: string;
  targetId: string | null;
  targetName: string | null;
  detail: string | null;
}

export async function listAudit(opts: { page: number; q?: string }) {
  const size = 50;
  const page = Math.max(1, opts.page || 1);
  let q = db()
    .from('audit_log')
    .select('id, created_at, kind, actor, action, target_id, target_name, detail', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * size, page * size - 1);
  const needle = (opts.q ?? '').replace(/[,()*%\\:]/g, ' ').trim().slice(0, 60);
  if (needle) q = q.or(`actor.ilike.*${needle}*,action.ilike.*${needle}*,target_name.ilike.*${needle}*,target_id.ilike.*${needle}*`);
  const res = await q;
  if (res.error) throw new Error(res.error.message);
  const items: AuditRow[] = (res.data as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    createdAt: r.created_at as string,
    kind: r.kind as string,
    actor: r.actor as string,
    action: r.action as string,
    targetId: r.target_id as string | null,
    targetName: r.target_name as string | null,
    detail: r.detail as string | null,
  }));
  return { items, total: res.count ?? items.length, page, pageSize: size };
}

// ---------------------------------------------------------------------------
// สถานะระบบ

export interface SystemStatus {
  line: { ok: boolean; botName: string | null; detail: string };
  webhook: { url: string | null; active: boolean | null; detail: string };
  liffId: string;
  appBaseUrl: string;
  storage: { ok: boolean; detail: string };
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const token = serverEnv.lineChannelAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const timeout = () => AbortSignal.timeout(8000);
  const [bot, hook, bucket] = await Promise.all([
    fetch('https://api.line.me/v2/bot/info', { headers, signal: timeout() })
      .then(async (r) => (r.ok ? { ok: true, botName: ((await r.json()) as { displayName?: string }).displayName ?? null, detail: '' } : { ok: false, botName: null, detail: `LINE ${r.status}` }))
      .catch((e: Error) => ({ ok: false, botName: null, detail: e.message })),
    fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', { headers, signal: timeout() })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { endpoint?: string; active?: boolean; message?: string };
        return { url: j.endpoint ?? null, active: j.active ?? null, detail: r.ok ? '' : j.message ?? `LINE ${r.status}` };
      })
      .catch((e: Error) => ({ url: null, active: null, detail: e.message })),
    db()
      .storage.getBucket('applicant-docs')
      .then((r) => ({ ok: !r.error && r.data?.public === false, detail: r.error?.message ?? (r.data?.public ? 'bucket เปิดสาธารณะ!' : '') })),
  ]);
  return { line: bot, webhook: hook, liffId: serverEnv.liffId(), appBaseUrl: serverEnv.appBaseUrl(), storage: bucket };
}
