'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APPLICANT_LIST_VIEWS,
  type ApplicantDetail,
  type ApplicantListFilter,
  type ApplicantListResult,
  type ApplicantListView,
  type ReviewItemInput,
} from '@/lib/admin/types';
import { Icon, Spinner } from '@/components/ui';
import { canAccess } from '@/lib/admin/roles';
import { adminFetch } from './admin-lib';
import { useAdmin } from './shell';
import { ApplicantDetailPanel, type DetailActions } from './applicant-detail';
import { ApplicantInfoForm } from './applicant-info';
import { ApplicantList } from './applicant-list';

/** id ผู้สมัครที่เลือก เก็บใน ?id= — รีเฟรช/ส่งลิงก์ให้เพื่อนร่วมทีมแล้วเปิดคนเดิมได้ */
function readSelected(): string | null {
  return new URLSearchParams(window.location.search).get('id');
}
/** ?filter= / ?view= — ลิงก์จากหน้าภาพรวม และรีเฟรชแล้วยังอยู่แท็บเดิม */
function readFilter(): ApplicantListFilter {
  const f = new URLSearchParams(window.location.search).get('filter');
  return f === 'pending_approval' || f === 'approved' || f === 'closed' ? f : 'all';
}
function readView(): ApplicantListView | null {
  const v = new URLSearchParams(window.location.search).get('view');
  return APPLICANT_LIST_VIEWS.find((x) => x === v) ?? null;
}
function writeListParams(filter: ApplicantListFilter, view: ApplicantListView | null) {
  const url = new URL(window.location.href);
  if (filter !== 'all' && !view) url.searchParams.set('filter', filter);
  else url.searchParams.delete('filter');
  if (view) url.searchParams.set('view', view);
  else url.searchParams.delete('view');
  window.history.replaceState(null, '', url);
}
function writeSelected(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('id', id);
  else url.searchParams.delete('id');
  window.history.replaceState(null, '', url);
}

export function AdminApp() {
  const me = useAdmin();
  const canRemind = canAccess(me.role, 'reminders');
  const [q, setQ] = useState('');
  // ?filter= / ?view= จากลิงก์ในหน้าภาพรวม
  const [filter, setFilter] = useState<ApplicantListFilter>(readFilter);
  const [view, setView] = useState<ApplicantListView | null>(readView);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ApplicantListResult | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  // render หลัง AdminShell รู้ตัวแอดมินแล้ว (ฝั่ง browser เท่านั้น) จึงอ่าน URL ได้เลย
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  /** ผลโหลดรายละเอียดล่าสุด ผูกกับ id — ไม่ตรงกับ selectedId = กำลังโหลด */
  const [loaded, setLoaded] = useState<{ id: string; detail: ApplicantDetail | null; error: string | null } | null>(null);
  const listSeq = useRef(0);
  const [creating, setCreating] = useState(false);
  /** หน้ารายละเอียดมีผลตรวจที่ยังไม่บันทึก */
  const dirtyRef = useRef(false);
  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  // ---------- รายชื่อ (รอพิมพ์เสร็จ 300ms ก่อนค้นหา) ----------
  const loadList = useCallback(async (opts: { q: string; filter: ApplicantListFilter; view: ApplicantListView | null; page: number }) => {
    const seq = ++listSeq.current;
    setListLoading(true);
    const params = new URLSearchParams({ q: opts.q, filter: opts.filter, page: String(opts.page) });
    if (opts.view) params.set('view', opts.view);
    const r = await adminFetch<ApplicantListResult>(`applicants?${params}`);
    if (seq !== listSeq.current) return; // มีคำค้นใหม่กว่าแล้ว
    setListLoading(false);
    if (r.ok) {
      setList(r.data);
      setListError(null);
    } else setListError(r.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadList({ q, filter, view, page }), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, filter, view, page, loadList]);

  // ---------- รายละเอียด ----------
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    adminFetch<ApplicantDetail>(`applicants/${selectedId}`).then((r) => {
      if (!cancelled) setLoaded({ id: selectedId, detail: r.ok ? r.data : null, error: r.ok ? null : r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  const current = loaded && loaded.id === selectedId ? loaded : null;
  const detail = current?.detail ?? null;

  const select = (id: string | null) => {
    if (dirtyRef.current && id !== selectedId && !window.confirm('มีผลตรวจที่ยังไม่บันทึก — ออกจากหน้านี้โดยไม่บันทึก?')) return;
    dirtyRef.current = false;
    setCreating(false);
    setSelectedId(id);
    writeSelected(id);
  };

  /** หลังสั่งงานสำเร็จ: ใช้รายละเอียดที่ server ส่งกลับ + โหลดรายชื่อใหม่ให้สถานะตรง */
  const mutate = useCallback(
    async (path: string, body: unknown): Promise<string | null> => {
      if (!selectedId) return 'ยังไม่ได้เลือกผู้สมัคร';
      const r = await adminFetch<ApplicantDetail>(`applicants/${selectedId}/${path}`, { method: 'POST', body });
      if (!r.ok) return r.error;
      setLoaded({ id: selectedId, detail: r.data, error: null });
      loadList({ q, filter, view, page });
      return null;
    },
    [selectedId, q, filter, view, page, loadList],
  );

  const actions: DetailActions = {
    review: (items: ReviewItemInput[], notify) => mutate('reviews', { items, notify }),
    approve: (approved, notify, docScope) => mutate('approval', { approved, notify, docScope }),
    setDocScope: (scope, notify) => mutate('doc-scope', { scope, notify }),
    setClosed: (status, reason) => mutate('closed', { status, reason }),
    feedback: (text, sendLine) => mutate('feedback', { text, sendLine }),
    unlinkLine: () => mutate('unlink-line', {}),
    saveInfo: (input) => mutate('info', input),
    remind: canRemind
      ? async () => {
          if (!selectedId) return 'ยังไม่ได้เลือกผู้สมัคร';
          const r = await adminFetch(`applicants/${selectedId}/remind`, { method: 'POST', body: {} });
          return r.ok ? null : r.error;
        }
      : undefined,
    remove: async (confirmCode) => {
      if (!selectedId) return 'ยังไม่ได้เลือกผู้สมัคร';
      const r = await adminFetch<{ id: string }>(`applicants/${selectedId}/delete`, { method: 'POST', body: { confirmCode } });
      if (!r.ok) return r.error;
      select(null);
      loadList({ q, filter, view, page });
      return null;
    },
  };


  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
        <div className={`min-h-0 border-line lg:flex lg:border-r ${selectedId || creating ? 'hidden' : 'flex'} flex-col`}>
          <ApplicantList
            q={q}
            filter={filter}
            view={view}
            result={list}
            loading={listLoading}
            error={listError}
            selectedId={selectedId}
            onQuery={(v) => {
              setQ(v);
              setPage(1);
            }}
            onFilter={(f) => {
              setFilter(f);
              setView(null);
              setPage(1);
              writeListParams(f, null);
            }}
            onView={(v) => {
              setView(v);
              setFilter('all');
              setPage(1);
              writeListParams('all', v);
            }}
            onPage={setPage}
            onSelect={select}
            onRemindAll={
              canRemind
                ? async () => {
                    if (!window.confirm('ส่ง LINE เตือนผู้สมัครทุกคนที่อนุมัติแล้วแต่ยังส่งเอกสารไม่ครบ?')) return;
                    const r = await adminFetch<{ sent: number; total: number; failed: Array<{ name: string }> }>('reminders/all', { method: 'POST', body: {} });
                    window.alert(
                      r.ok
                        ? `ส่งสำเร็จ ${r.data.sent}/${r.data.total} คน${r.data.failed.length ? `
ไม่สำเร็จ: ${r.data.failed.map((f) => f.name).join(', ')}` : ''}`
                        : r.error,
                    );
                  }
                : undefined
            }
            onCreate={() => {
              select(null);
              setCreating(true);
            }}
          />
        </div>

        <main className={`min-h-0 overflow-y-auto ${selectedId || creating ? 'block' : 'hidden lg:block'}`}>
          {(selectedId || creating) && (
            <button
              type="button"
              onClick={() => select(null)}
              className="m-4 mb-0 flex items-center gap-1 text-sm text-muted hover:text-foreground lg:hidden"
            >
              <Icon name="chevronLeft" className="size-4" /> กลับไปรายชื่อ
            </button>
          )}
          {creating && !selectedId && (
            <div className="mx-auto max-w-2xl space-y-3 p-4 lg:p-6">
              <h2 className="text-xl font-bold">เพิ่มผู้สมัคร</h2>
              <p className="text-sm text-muted">
                ผู้สมัครที่เพิ่มเองจะได้รับการอนุมัติทันที — ให้ผู้สมัครเปิดเมนูลงทะเบียนใน LINE แล้วกรอกเบอร์โทรนี้ ระบบจะผูกบัญชีให้
              </p>
              <ApplicantInfoForm
                submitLabel="เพิ่มผู้สมัคร"
                onCancel={() => setCreating(false)}
                onSubmit={async (input) => {
                  const r = await adminFetch<ApplicantDetail>('applicants', { method: 'POST', body: input });
                  if (!r.ok) return r.error;
                  setLoaded({ id: r.data.id, detail: r.data, error: null });
                  select(r.data.id);
                  loadList({ q, filter, view, page });
                  return null;
                }}
              />
            </div>
          )}
          {!selectedId && !creating && (
            <div className="flex h-full items-center justify-center p-8 text-center text-muted">
              <p>เลือกผู้สมัครจากรายชื่อเพื่อดูข้อมูลและตรวจเอกสาร</p>
            </div>
          )}
          {selectedId && !current && (
            <p className="flex items-center gap-2 p-6 text-muted" role="status">
              <Spinner className="size-5" /> กำลังโหลด...
            </p>
          )}
          {current?.error && <p className="m-6 rounded-lg bg-danger-tint p-3 text-sm text-danger">{current.error}</p>}
          {detail && <ApplicantDetailPanel key={detail.id} detail={detail} actions={actions} onDirtyChange={setDirty} />}
        </main>
    </div>
  );
}
