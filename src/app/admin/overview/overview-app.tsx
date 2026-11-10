'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Overview } from '@/lib/admin/overview-service';
import { Badge, ErrorText, Icon, Spinner } from '@/components/ui';
import { adminFetch, fmtRelative } from '../admin-lib';

const num = (n: number) => n.toLocaleString('th-TH');

/** การ์ดตัวเลข: ชื่อ · ตัวเลข · คำอธิบาย — ลิงก์ไปหน้าที่ใช้จัดการงานนั้น */
function StatTile({ label, value, hint, href, children }: { label: string; value: number; hint?: string; href?: string; children?: React.ReactNode }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{num(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </>
  );
  return href ? (
    <Link href={href} className="group block rounded-xl border border-line p-4 transition-colors hover:border-brand/50 hover:bg-surface">
      {body}
      <span className="mt-2 flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
        เปิดดู <Icon name="chevronRight" className="size-3" />
      </span>
    </Link>
  ) : (
    <div className="rounded-xl border border-line p-4">{body}</div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  welcome: 'ลงทะเบียนสำเร็จ',
  approved: 'อนุมัติผู้สมัคร',
  doc_rejected: 'เอกสารต้องแก้ไข',
  doc_approved: 'เอกสารผ่าน',
  docs_complete: 'ส่งเอกสารครบ',
  onboarding: 'แจ้งเริ่มงาน',
  custom: 'ข้อความจาก HR',
};

export function OverviewApp() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Overview>('overview').then((r) => (r.ok ? setData(r.data) : setError(r.error)));
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        <div>
          <h1 className="text-xl font-bold">ภาพรวม</h1>
          <p className="text-sm text-muted">งานที่รอ HR และสถานะผู้สมัครทั้งหมด</p>
        </div>
        <ErrorText>{error}</ErrorText>
        {!data && !error && (
          <p className="flex items-center gap-2 text-muted" role="status">
            <Spinner className="size-5" /> กำลังโหลด...
          </p>
        )}

        {data && (
          <>
            <section aria-labelledby="todo-title" className="space-y-3">
              <h2 id="todo-title" className="font-semibold">
                งานที่ต้องทำ
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="รออนุมัติผู้สมัคร" value={data.pendingApproval} hint="ลงทะเบียนครบ รอ HR อนุมัติ" href="/admin?filter=pending_approval" />
                <StatTile label="มีไฟล์รอตรวจ" value={data.waitingReview} hint="ผู้สมัครที่มีเอกสารรอ HR ตรวจ" href="/admin?filter=approved">
                  <dl className="mt-3 grid grid-cols-3 gap-1 border-t border-line pt-2 text-center text-xs">
                    <div>
                      <dt className="text-muted">ไม่ถึงวัน</dt>
                      <dd className="font-semibold tabular-nums">{num(data.reviewAging.under1d)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">1–3 วัน</dt>
                      <dd className="font-semibold tabular-nums">{num(data.reviewAging.d1to3)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">เกิน 3 วัน</dt>
                      <dd className="flex items-center justify-center gap-1 font-semibold tabular-nums">
                        {data.reviewAging.over3d > 0 && <Icon name="alert" className="size-3 text-warn" />}
                        {num(data.reviewAging.over3d)}
                      </dd>
                    </div>
                  </dl>
                </StatTile>
                <StatTile label="ส่งครบ รอแจ้งเริ่มงาน" value={data.submittedAll} hint="ส่งเอกสารครบแล้ว (บางคนอาจยังรอตรวจ)" href="/admin/onboarding" />
                <StatTile label="ไม่ขยับเกิน 3 วัน" value={data.stale3d} hint="อนุมัติแล้วแต่ยังส่งไม่ครบ และไม่มีการส่งไฟล์ 3 วัน" href="/admin?filter=approved" />
              </div>
            </section>

            <section aria-labelledby="all-title" className="space-y-3">
              <h2 id="all-title" className="font-semibold">
                ผู้สมัครทั้งหมด
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatTile label="ทั้งหมด" value={data.total} href="/admin" />
                <StatTile label="ใหม่ใน 7 วัน" value={data.newLast7d} />
                <StatTile label="ยังไม่กรอกข้อมูล" value={data.noProfile} hint="กดลงทะเบียนในแชทแล้วแต่ยังไม่กรอก" />
                <StatTile label="รอผู้สมัครแก้เอกสาร" value={data.waitingApplicantFix} />
                <StatTile label="แจ้งเริ่มงานแล้ว" value={data.onboarded} />
              </div>
            </section>

            <section aria-labelledby="noti-title" className="space-y-3">
              <h2 id="noti-title" className="font-semibold">
                แจ้งเตือน LINE ล่าสุด
              </h2>
              {data.recentNotifications.length === 0 ? (
                <p className="text-sm text-muted">ยังไม่มีการแจ้งเตือน</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {data.recentNotifications.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                      <span className="w-28 shrink-0 text-xs text-muted">{fmtRelative(n.createdAt)}</span>
                      <span className="font-medium">{TYPE_LABEL[n.type] ?? n.type}</span>
                      <span className="text-muted">{n.applicantName ?? '-'}</span>
                      <span className="ml-auto text-xs text-muted">โดย {n.sentBy}</span>
                      {n.status !== 'ok' && <Badge tone="danger">ส่งไม่สำเร็จ</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
