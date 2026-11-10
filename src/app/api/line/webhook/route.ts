/**
 * LINE Webhook — ตั้ง URL นี้ใน LINE Developers Console:  https://<โดเมน>/api/line/webhook
 *
 * ลำดับการทำงาน:
 *  1. ตรวจลายเซ็น X-Line-Signature (ไม่ผ่าน → 401)
 *  2. ตอบ 200 ให้ LINE ทันที
 *  3. ประมวลผล event ต่อเบื้องหลังด้วย after() — reply token ใช้ได้ราว 1 นาที จึงยังตอบกลับได้ทัน
 */
import { after } from 'next/server';
import { serverEnv } from '@/lib/env';
import { createLineClient, describeFetchError } from '@/lib/line/client';
import { DEFAULT_LOGO_URL } from '@/lib/line/flex';
import { handleLineEvent } from '@/lib/line/handler';
import { verifyLineSignature } from '@/lib/line/signature';
import type { LineWebhookBody } from '@/lib/line/types';
import { createSupabaseRepo } from '@/lib/repo/supabase';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function POST(request: Request) {
  // ตรวจลายเซ็นจาก byte ดิบ — ห้าม decode เป็นข้อความก่อน เพราะ byte อาจเปลี่ยนแล้วลายเซ็นไม่ตรง
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!verifyLineSignature(rawBody, request.headers.get('x-line-signature'), serverEnv.lineChannelSecret())) {
    return Response.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody)) as LineWebhookBody;
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const events = body.events ?? [];
  if (events.length > 0) {
    after(async () => {
      const deps = {
        repo: createSupabaseRepo(getSupabaseAdmin()),
        line: createLineClient(serverEnv.lineChannelAccessToken()),
        config: {
          liffId: serverEnv.liffId(),
          appBaseUrl: serverEnv.appBaseUrl(),
          logoUrl: serverEnv.lineLogoUrl() || DEFAULT_LOGO_URL,
          maxUploadBytes: serverEnv.maxUploadBytes(),
        },
      };
      // ประมวลผลทีละ event ตามลำดับ (event ของคนเดียวกันต้องไม่สลับลำดับกัน)
      for (const event of events) {
        try {
          await handleLineEvent(event, deps);
        } catch (err) {
          console.error('[line webhook] event failed', event.type, describeFetchError(err), err);
        }
      }
    });
  }

  // LINE ส่ง events ว่างตอนกดปุ่ม Verify ใน console — ตอบ 200 เฉยๆ
  return Response.json({ ok: true });
}
