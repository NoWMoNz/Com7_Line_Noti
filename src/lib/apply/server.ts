import 'server-only';
import { serverEnv } from '@/lib/env';
import { createLineClient } from '@/lib/line/client';
import { DEFAULT_LOGO_URL } from '@/lib/line/flex';
import { channelIdFromLiffId, verifyLineIdToken } from '@/lib/line/id-token';
import { createSupabaseRepo } from '@/lib/repo/supabase';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PortalError, type PortalDeps } from './portal';
import type { ApplyResponse, ApplyState } from './types';

export function getPortalDeps(): PortalDeps {
  return {
    repo: createSupabaseRepo(getSupabaseAdmin()),
    line: createLineClient(serverEnv.lineChannelAccessToken()),
    config: {
      liffId: serverEnv.liffId(),
      appBaseUrl: serverEnv.appBaseUrl(),
      logoUrl: serverEnv.lineLogoUrl() || DEFAULT_LOGO_URL,
      maxUploadBytes: serverEnv.maxUploadBytes(),
    },
  };
}

/**
 * LINE userId ของคนที่เปิดหน้า — ได้จากการตรวจ ID token กับ LINE เท่านั้น
 * ไม่มี ID token (เปิดนอก LINE) → null
 */
export async function verifiedLineUserId(idToken: unknown): Promise<string | null> {
  if (typeof idToken !== 'string' || !idToken) return null;
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID?.trim() || channelIdFromLiffId(serverEnv.liffId());
  const res = await verifyLineIdToken(idToken, channelId);
  if (res.ok) return res.userId;
  console.warn('[apply] verify id token failed:', res.reason, res.detail);
  if (res.reason === 'unavailable') {
    throw new PortalError('unavailable', 'เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  throw new PortalError('line_auth', 'ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดหน้านี้ใหม่จาก LINE');
}

const STATUS: Record<PortalError['code'], number> = {
  invalid_input: 400,
  line_auth: 401,
  not_allowed: 403,
  line_mismatch: 403,
  not_found: 404,
  unavailable: 503,
};

/** รันคำสั่งของหน้าผู้สมัคร แล้วแปลงผล/ข้อผิดพลาดเป็น JSON */
export async function respond(run: () => Promise<ApplyState>): Promise<Response> {
  try {
    const state = await run();
    return Response.json({ ok: true, state } satisfies ApplyResponse, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof PortalError) {
      return Response.json({ ok: false, error: err.message, code: err.code } satisfies ApplyResponse, {
        status: STATUS[err.code],
      });
    }
    console.error('[apply] unexpected error', err);
    return Response.json(
      { ok: false, error: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง' } satisfies ApplyResponse,
      { status: 500 },
    );
  }
}

/** อ่าน body JSON แบบไม่ throw */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
