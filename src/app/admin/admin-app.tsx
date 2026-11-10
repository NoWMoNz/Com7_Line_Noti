'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApplicantDetail,
  ApplicantListFilter,
  ApplicantListResult,
  ReviewItemInput,
} from '@/lib/admin/types';
import { Icon, Spinner } from '@/components/ui';
import { adminFetch } from './admin-lib';
import { ApplicantDetailPanel, type DetailActions } from './applicant-detail';
import { ApplicantInfoForm } from './applicant-info';
import { ApplicantList } from './applicant-list';

/** id ผู้สมัครที่เลือก เก็บใน ?id= — รีเฟรช/ส่งลิงก์ให้เพื่อนร่วมทีมแล้วเปิดคนเดิมได้ */
function readSelected(): string | null {
  return new URLSearchParams(window.location.search).get('id');
}
function writeSelected(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('id', id);
  else url.searchParams.delete('id');
  window.history.replaceState(null, '', url);
}

export function AdminApp() {
  const [q, setQ] = useState('');
  // ?filter= จากลิงก์ในหน้าภาพรวม
  const [filter, setFilter] = useState<ApplicantListFilter>(() => {
    const f = new URLSearchParams(window.location.search).get('filter');
    return f === 'pending_approval' || f === 'approved' ? f : 'all';
  });
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

  // ---------- รายชื่อ (รอพิมพ์เสร็จ 300ms ก่อนค้นหา) ----------
  const loadList = useCallback(async (opts: { q: string; filter: ApplicantListFilter; page: number }) => {
    const seq = ++listSeq.current;
    setListLoading(true);
    const params = new URLSearchParams({ q: opts.q, filter: opts.filter, page: String(opts.page) });
    const r = await adminFetch<ApplicantListResult>(`applicants?${params}`);
    if (seq !== listSeq.current) return; // มีคำค้นใหม่กว่าแล้ว
    setListLoading(false);
    if (r.ok) {
      setList(r.data);
      setListError(null);
    } else setListError(r.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadList({ q, filter, page }), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, filter, page, loadList]);

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
      loadList({ q, filter, page });
      return null;
    },
    [selectedId, q, filter, page, loadList],
  );

  const actions: DetailActions = {
    review: (items: ReviewItemInput[], notify) => mutate('reviews', { items, notify }),
    approve: (approved, notify) => mutate('approval', { approved, notify }),
    feedback: (text, sendLine) => mutate('feedback', { text, sendLine }),
    unlinkLine: () => mutate('unlink-line', {}),
    saveInfo: (input) => mutate('info', input),
    remove: async (confirmCode) => {
      if (!selectedId) return 'ยังไม่ได้เลือกผู้สมัคร';
      const r = await adminFetch<{ id: string }>(`applicants/${selectedId}/delete`, { method: 'POST', body: { confirmCode } });
      if (!r.ok) return r.error;
      select(null);
      loadList({ q, filter, page });
      return null;
    },
  };


  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
        <div className={`min-h-0 border-line lg:flex lg:border-r ${selectedId || creating ? 'hidden' : 'flex'} flex-col`}>
          <ApplicantList
            q={q}
            filter={filter}
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
              setPage(1);
            }}
            onPage={setPage}
            onSelect={select}
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
                  loadList({ q, filter, page });
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
          {detail && <ApplicantDetailPanel key={detail.id} detail={detail} actions={actions} />}
        </main>
    </div>
  );
}
