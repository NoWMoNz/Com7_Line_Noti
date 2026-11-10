'use client';

import type { ApplicantListFilter, ApplicantListResult } from '@/lib/admin/types';
import { Badge, Icon, Spinner } from '@/components/ui';
import { fmtRelative, STAGE } from './admin-lib';

const FILTERS: Array<{ value: ApplicantListFilter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'pending_approval', label: 'รออนุมัติ' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
];

export function ApplicantList({
  q,
  filter,
  result,
  loading,
  error,
  selectedId,
  onQuery,
  onFilter,
  onPage,
  onSelect,
}: {
  q: string;
  filter: ApplicantListFilter;
  result: ApplicantListResult | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onQuery: (q: string) => void;
  onFilter: (f: ApplicantListFilter) => void;
  onPage: (p: number) => void;
  onSelect: (id: string) => void;
}) {
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <section aria-label="รายชื่อผู้สมัคร" className="flex min-h-0 flex-col">
      <div className="space-y-3 border-b border-line p-4">
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
        <div className="flex gap-1.5" role="radiogroup" aria-label="กรองตามสถานะ">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => onFilter(f.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                filter === f.value ? 'bg-foreground text-background' : 'bg-surface text-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
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
                      {a.pendingReview > 0 && a.stage !== 'review' && <Badge tone="info">รอตรวจ {a.pendingReview}</Badge>}
                      {a.approved && (
                        <span className="text-xs text-muted">
                          เอกสาร {a.satisfied}/{a.total}
                        </span>
                      )}
                    </div>
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
