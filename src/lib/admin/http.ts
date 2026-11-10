import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { AdminAuthError, requireAdmin } from './auth';
import { ReviewInputError } from './logic';
import { AdminInputError } from './service';
import type { AdminProfile, AdminResponse } from './types';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** ตรวจสิทธิ์แอดมิน → รันคำสั่ง → ตอบ JSON { ok, data } หรือ { ok: false, error } */
export async function adminRoute<T>(run: (admin: AdminProfile) => Promise<T>): Promise<Response> {
  try {
    const admin = await requireAdmin();
    const data = await run(admin);
    return Response.json({ ok: true, data } satisfies AdminResponse<T>, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown): Response {
  // สัญญาณภายในของ Next (เช่น cookies() ตอน build พยายาม prerender) ต้องโยนต่อ ห้ามแปลงเป็น 500
  unstable_rethrow(err);
  if (err instanceof AdminAuthError) {
    return Response.json({ ok: false, error: err.message } satisfies AdminResponse<never>, { status: err.status, headers: NO_STORE });
  }
  if (err instanceof AdminInputError || err instanceof ReviewInputError) {
    return Response.json({ ok: false, error: err.message } satisfies AdminResponse<never>, { status: 400, headers: NO_STORE });
  }
  console.error('[admin] unexpected error', err);
  return Response.json({ ok: false, error: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง' } satisfies AdminResponse<never>, {
    status: 500,
    headers: NO_STORE,
  });
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = (await request.json()) as unknown;
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
