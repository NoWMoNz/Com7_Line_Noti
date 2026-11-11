'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ApplicantListFilter, ApplicantListResult, ApplicantListView } from '@/lib/admin/types';
import { Badge, Icon, Spinner } from '@/components/ui';
import { DOC_SCOPE_LABEL, fmtRelative, STAGE } from './admin-lib';

const FILTERS: Array<{ value: ApplicantListFilter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'pending_approval', label: 'รออนุมัติ' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
];

/** มุมมองด่วน — ชื่อตรงกับการ์ดในหน้าภาพรวม */
export const VIEWS: Record<ApplicantListView, { label: string; hint: string }> = {
  review: { label: 'มีไฟล์รอตรวจ', hint: 'เรียงจากรอนานที่สุดขึ้นก่อน' },
  rejected: { label: 'รอผู้สมัครแก้เอกสาร', hint: 'มีเอกสารที่ตีกลับไปให้แก้' },
  stale3d: { label: 'ไม่ขยับเกิน 3 วัน', hint: 'อนุมัติแล้วแต่ยังส่งไม่ครบ และไม่มีการส่งไฟล์ 3 วัน' },
  no_profile: { label: 'ยังไม่กรอกข้อมูล', hint: 'กดลงทะเบียนในแชทแล้วแต่ยังไม่กรอกชื่อ/เบอร์' },
  new7d: { label: 'ใหม่ใน 7 วัน', hint: 'ลงทะเบียนภายใน 7 วันที่ผ่านมา' },
};

export function ApplicantList({
  q,
  filter,
  view,
  result,
  loading,
  error,
  selectedId,
  onQuery,
  onFilter,
  onView,
  onPage,
  onSelect,
  onCreate,
  onRemindAll,
}: {
  q: string;
  filter: ApplicantListFilter;
  view: ApplicantListView | null;
  result: ApplicantListResult | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onQuery: (q: string) => void;
  onFilter: (f: ApplicantListFilter) => void;
  /** null = ล้างมุมมองด่วน */
  onView: (v: ApplicantListView | null) => void;
  onPage: (p: number) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  /** มี = มีสิทธิ์เตือนทุกคนที่ยังส่งไม่ครบ */
  onRemindAll?: () => void;
}) {
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <section aria-label="รายชื่อผู้สมัคร" className="flex min-h-0 flex-col">
      <div className="space-y-3 border-b border-line p-4">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-sm font-medium text-brand hover:border-brand hover:bg-brand-tint"
        >
          <Icon name="plus" className="size-4" /> เพิ่มผู้สมัคร
        </button>
        {onRemindAll && (
          <button type="button" onClick={onRemindAll} className="w-full text-center text-xs text-muted underline underline-offset-2 hover:text-foreground">
            ส่ง LINE เตือนทุกคนที่ยังส่งเอกสารไม่ครบ
          </button>
        )}
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์โทร หรือรหัส"
            aria-label="ค้นหาผู้สมัคร"
            className="h-10 w-full rounded-lg border border-line bg-background pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="relative flex flex-wrap gap-1.5" role="radiogroup" aria-label="กรองตามสถานะ">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={!view && filter === f.value}
              onClick={() => onFilter(f.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                !view && filter === f.value ? 'bg-foreground text-background' : 'bg-surface text-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
          <MorePill view={view} filter={filter} onView={onView} onFilter={onFilter} />
          <span className="ml-auto self-center text-xs text-muted">{result ? `${result.total.toLocaleString('th-TH')} คน` : ''}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <p className="m-4 rounded-lg bg-danger-tint p-3 text-sm text-danger">{error}</p>}
        {loading && !result && (
          <p className="flex items-center gap-2 p-4 text-sm text-muted" role="status">
            <Spinner className="size-4" /> กำลังโหลด...
          </p>
        )}
        {result && result.movedToOnboarding > 0 && (
          <Link
            href="/admin/onboarding"
            className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 text-xs text-muted hover:text-foreground"
          >
            <span>อนุมัติเอกสารครบแล้ว {result.movedToOnboarding.toLocaleString('th-TH')} คน ย้ายไปอยู่หน้าแจ้งเริ่มงาน</span>
            <span className="shrink-0 font-medium text-brand">ไปที่หน้า →</span>
          </Link>
        )}
        {filter === 'closed' && (
          <p className="border-b border-line bg-surface px-4 py-2 text-xs text-muted">
            ผู้สมัครที่ปิดใบสมัครแล้ว (Cancel / Turndown) — ไม่ถูกเตือนเอกสารและไม่ขึ้นหน้าแจ้งเริ่มงาน เปิดดูเพื่อคืนสถานะได้
          </p>
        )}
        {result && result.items.length === 0 && <p className="p-6 text-center text-sm text-muted">ไม่พบผู้สมัคร</p>}
        <ul className={`divide-y divide-line ${loading ? 'opacity-60' : ''}`}>
          {result?.items.map((a) => {
            const stage = STAGE[a.stage];
            const active = a.id === selectedId;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  aria-current={active || undefined}
                  className={`flex w-full gap-3 px-4 py-3 text-left transition-colors ${
                    active ? 'bg-brand-tint' : 'hover:bg-surface'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{a.name || <span className="text-muted">(ยังไม่กรอกชื่อ)</span>}</p>
                      {!a.lineLinked && <span className="shrink-0 text-xs text-muted">ไม่มี LINE</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {a.phone || '-'} · {a.code}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={stage.tone}>{stage.label}</Badge>
                      {a.pendingReview > 0 && a.stage !== 'review' && a.stage !== 'cancel' && a.stage !== 'turndown' && (
                        <Badge tone="info">รอตรวจ {a.pendingReview}</Badge>
                      )}
                      {a.approved && a.docScope === 'initial' && <Badge tone="warn">{DOC_SCOPE_LABEL.initial}</Badge>}
                      {a.approved && (
                        <span className="text-xs text-muted">
                          เอกสาร {a.satisfied}/{a.total}
                        </span>
                      )}
                    </div>
                    {a.closedReason && <p className="mt-1 truncate text-xs text-muted">เหตุผล: {a.closedReason}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted">{fmtRelative(a.lastUploadedAt ?? a.createdAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {result && pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm">
          <button
            type="button"
            disabled={result.page <= 1}
            onClick={() => onPage(result.page - 1)}
            className="rounded px-2 py-1 hover:bg-surface disabled:text-muted disabled:hover:bg-transparent"
          >
            ก่อนหน้า
          </button>
          <span className="text-muted">
            หน้า {result.page}/{pages}
          </span>
          <button
            type="button"
            disabled={result.page >= pages}
            onClick={() => onPage(result.page + 1)}
            className="rounded px-2 py-1 hover:bg-surface disabled:text-muted disabled:hover:bg-transparent"
          >
            ถัดไป
          </button>
        </div>
      )}
    </section>
  );
}

const CLOSED_ITEM = { label: 'Cancel/Turndown', hint: 'ปิดใบสมัครแล้ว — เปิดดูเพื่อคืนสถานะได้' };

/** ปุ่ม "อื่นๆ" — เปิดเมนูมุมมองด่วน + Cancel/Turndown (เลือกแล้วปุ่มเปลี่ยนเป็นชื่อที่เลือก) */
function MorePill({
  view,
  filter,
  onView,
  onFilter,
}: {
  view: ApplicantListView | null;
  filter: ApplicantListFilter;
  onView: (v: ApplicantListView | null) => void;
  onFilter: (f: ApplicantListFilter) => void;
}) {
  const closed = !view && filter === 'closed';
  const active = !!view || closed;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ปิดเมื่อคลิกข้างนอก / กด Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (v: ApplicantListView | null) => {
    onView(v);
    setOpen(false);
  };
  const pickClosed = () => {
    onFilter('closed');
    setOpen(false);
  };

  return (
    // เมนูยึดความกว้างของแถวแท็บ (wrapper ไม่ใช่ relative) — ไม่ล้นจอมือถือ
    <div ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
          active ? 'bg-foreground text-background' : open ? 'bg-line text-foreground' : 'bg-surface text-muted hover:text-foreground'
        }`}
      >
        {view ? VIEWS[view].label : closed ? CLOSED_ITEM.label : 'อื่นๆ'}
        <Icon name="chevronLeft" className={`size-3.5 transition-transform ${open ? 'rotate-90' : '-rotate-90'}`} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="มุมมองอื่นๆ"
          className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-line bg-background py-1 shadow-lg"
        >
          {(Object.keys(VIEWS) as ApplicantListView[]).map((v) => (
            <button
              key={v}
              type="button"
              role="menuitemradio"
              aria-checked={view === v}
              onClick={() => pick(v)}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface ${view === v ? 'bg-brand-tint' : ''}`}
            >
              <Icon name="check" className={`mt-0.5 size-4 shrink-0 text-brand ${view === v ? '' : 'invisible'}`} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{VIEWS[v].label}</span>
                <span className="block text-xs text-muted">{VIEWS[v].hint}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={closed}
            onClick={pickClosed}
            className={`flex w-full items-start gap-2 border-t border-line px-3 py-2 text-left hover:bg-surface ${closed ? 'bg-brand-tint' : ''}`}
          >
            <Icon name="check" className={`mt-0.5 size-4 shrink-0 text-brand ${closed ? '' : 'invisible'}`} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{CLOSED_ITEM.label}</span>
              <span className="block text-xs text-muted">{CLOSED_ITEM.hint}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
