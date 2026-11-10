'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuditRow, NotificationRow, SystemStatus } from '@/lib/admin/overview-service';
import { Badge, ErrorText, Icon, Spinner } from '@/components/ui';
import { adminFetch, fmtDateTime } from '../admin-lib';

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export function SettingsApp() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8 p-4 lg:p-6">
        <div>
          <h1 className="text-xl font-bold">ตั้งค่าและประวัติ</h1>
          <p className="text-sm text-muted">สถานะการเชื่อมต่อ ประวัติการแจ้งเตือน LINE และประวัติการแก้ไขข้อมูล</p>
        </div>
        <StatusSection />
        <NotificationsSection />
        <AuditSection />
      </div>
    </div>
  );
}

function Row({ label, ok, children }: { label: string; ok: boolean | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="w-40 shrink-0 text-sm font-medium">{label}</span>
      <span className="min-w-0 flex-1 break-all text-sm">{children}</span>
      {ok !== null && (
        <Badge tone={ok ? 'brand' : 'danger'}>
          <Icon name={ok ? 'check' : 'alert'} className="mr-1 size-3" />
          {ok ? 'ปกติ' : 'มีปัญหา'}
        </Badge>
      )}
    </div>
  );
}

function StatusSection() {
  const [s, setS] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminFetch<SystemStatus>('system').then((r) => (r.ok ? setS(r.data) : setError(r.error)));
  }, []);
  const expectedHook = s?.appBaseUrl ? `${s.appBaseUrl.replace(/\/$/, '')}/api/line/webhook` : null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">การเชื่อมต่อระบบ</h2>
      <ErrorText>{error}</ErrorText>
      {!s && !error && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4" /> กำลังตรวจสอบ...
        </p>
      )}
      {s && (
        <div className="divide-y divide-line rounded-xl border border-line">
          <Row label="LINE Messaging API" ok={s.line.ok}>
            {s.line.ok ? `บอท ${s.line.botName}` : s.line.detail}
          </Row>
          <Row label="Webhook" ok={s.webhook.url ? s.webhook.active !== false : false}>
            {s.webhook.url ?? 'ยังไม่ได้ตั้ง Webhook URL'}
            {s.webhook.active === false && ' (ปิด Use webhook อยู่)'}
            {expectedHook && s.webhook.url && s.webhook.url !== expectedHook && (
              <span className="block text-xs text-warn">ไม่ตรงกับ APP_BASE_URL ({expectedHook})</span>
            )}
          </Row>
          <Row label="LINE MINI App (LIFF ID)" ok={!!s.liffId}>
            {s.liffId || 'ยังไม่ได้ตั้ง NEXT_PUBLIC_LIFF_ID'}
          </Row>
          <Row label="ที่เก็บไฟล์" ok={s.storage.ok}>
            {s.storage.ok ? 'applicant-docs (private)' : s.storage.detail}
          </Row>
        </div>
      )}
    </section>
  );
}

function Pager({ data, onPage }: { data: Paged<unknown>; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      <button type="button" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)} className="rounded px-2 py-1 hover:bg-surface disabled:text-muted">
        ก่อนหน้า
      </button>
      <span className="text-muted">
        หน้า {data.page}/{pages}
      </span>
      <button type="button" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)} className="rounded px-2 py-1 hover:bg-surface disabled:text-muted">
        ถัดไป
      </button>
    </div>
  );
}

function NotificationsSection() {
  const [page, setPage] = useState(1);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [data, setData] = useState<Paged<NotificationRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), ...(onlyErrors ? { status: 'error' } : {}) });
    adminFetch<Paged<NotificationRow>>(`logs/notifications?${p}`).then((r) => (r.ok ? setData(r.data) : setError(r.error)));
  }, [page, onlyErrors]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">ประวัติการแจ้งเตือน LINE</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyErrors}
            onChange={(e) => {
              setOnlyErrors(e.target.checked);
              setPage(1);
            }}
            className="size-4 accent-brand"
          />
          เฉพาะที่ส่งไม่สำเร็จ
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
      {data && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">เวลา</th>
                  <th className="px-3 py-2 font-semibold">ประเภท</th>
                  <th className="px-3 py-2 font-semibold">ผู้สมัคร</th>
                  <th className="px-3 py-2 font-semibold">ข้อความ</th>
                  <th className="px-3 py-2 font-semibold">โดย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((n) => (
                  <tr key={n.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDateTime(n.createdAt)}</td>
                    <td className="px-3 py-2">
                      {n.type}
                      {n.status !== 'ok' && (
                        <span className="ml-1">
                          <Badge tone="danger">{n.error ?? 'ไม่สำเร็จ'}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{n.applicantName ?? '-'}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-muted" title={n.preview ?? ''}>
                      {n.preview}
                    </td>
                    <td className="px-3 py-2 text-muted">{n.sentBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && <p className="p-4 text-center text-sm text-muted">ไม่มีรายการ</p>}
          </div>
          <Pager data={data} onPage={setPage} />
        </>
      )}
    </section>
  );
}

function AuditSection() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Paged<AuditRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback((p: number, needle: string) => {
    adminFetch<Paged<AuditRow>>(`logs/audit?${new URLSearchParams({ page: String(p), q: needle })}`).then((r) => (r.ok ? setData(r.data) : setError(r.error)));
  }, []);
  useEffect(() => load(page, query), [page, query, load]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">ประวัติการแก้ไขข้อมูล (Audit log)</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q);
          }}
          className="flex gap-2"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา ผู้ทำ การกระทำ รหัส ชื่อ"
            aria-label="ค้นหา audit log"
            className="h-9 rounded-lg border border-line bg-background px-3 text-sm outline-none focus:border-brand"
          />
          <button type="submit" className="rounded-lg bg-foreground px-3 text-sm font-semibold text-background">
            ค้นหา
          </button>
        </form>
      </div>
      <ErrorText>{error}</ErrorText>
      {data && (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.items.map((a) => (
              <li key={a.id} className="space-y-0.5 px-4 py-2.5 text-sm">
                <p>
                  <span className="text-xs text-muted">{fmtDateTime(a.createdAt)}</span> · <span className="font-medium">{a.actor}</span> {a.action}{' '}
                  {a.targetName && <span className="text-muted">— {a.targetName}</span>} {a.targetId && <span className="text-xs text-muted">({a.targetId})</span>}
                </p>
                {a.detail && <p className="break-all text-xs text-muted">{a.detail}</p>}
              </li>
            ))}
            {data.items.length === 0 && <li className="p-4 text-center text-sm text-muted">ไม่มีรายการ</li>}
          </ul>
          <Pager data={data} onPage={setPage} />
        </>
      )}
    </section>
  );
}
