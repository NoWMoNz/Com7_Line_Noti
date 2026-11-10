/**
 * งานรายวันของ Vercel Cron (vercel.json: 09:00 เวลาไทย) — เตือนใกล้กำหนดส่ง + ติดตาม 3 วัน
 * Vercel ส่ง Authorization: Bearer <CRON_SECRET> มาเอง — ไม่ตั้ง CRON_SECRET = ปฏิเสธทุกคำขอ
 */
import { runDailyReminders } from '@/lib/reminders/service';

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const r = await runDailyReminders();
    const summary = {
      settings: r.settings,
      deadline: { sent: r.deadline.filter((x) => x.ok).length, failed: r.deadline.filter((x) => !x.ok).length },
      followup: { sent: r.followup.filter((x) => x.ok).length, failed: r.followup.filter((x) => !x.ok).length },
    };
    console.log('[cron] reminders', JSON.stringify(summary));
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[cron] reminders failed', err);
    return Response.json({ ok: false, error: 'failed' }, { status: 500 });
  }
}
