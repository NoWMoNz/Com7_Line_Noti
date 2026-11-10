'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdminProfile,
  ApplicantDetail,
  ApplicantListFilter,
  ApplicantListResult,
  ReviewItemInput,
} from '@/lib/admin/types';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { Icon, Spinner } from '@/components/ui';
import { adminFetch } from './admin-lib';
import { ApplicantDetailPanel, type DetailActions } from './applicant-detail';
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
  const [me, setMe] = useState<AdminProfile | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ApplicantListFilter>('all');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ApplicantListResult | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** ผลโหลดรายละเอียดล่าสุด ผูกกับ id — ไม่ตรงกับ selectedId = กำลังโหลด */
  const [loaded, setLoaded] = useState<{ id: string; detail: ApplicantDetail | null; error: string | null } | null>(null);
  const listSeq = useRef(0);

  useEffect(() => {
    adminFetch<AdminProfile>('me').then((r) => {
      if (!r.ok) return;
      setMe(r.data);
      setSelectedId(readSelected());
    });
  }, []);

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
  };

  async function logout() {
    await getSupabaseBrowser().auth.signOut();
    window.location.replace('/admin/login');
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <p className="font-semibold">
          <span className="text-brand">Com7</span> Recruitment
        </p>
        <span className="hidden text-sm text-muted sm:inline">· ผู้สมัคร</span>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {me && (
            <span className="hidden text-muted sm:inline">
              {me.fullName || me.email} <span className="text-xs">({me.role})</span>
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-muted hover:bg-surface hover:text-foreground"
          >
            <Icon name="logout" className="size-4" /> ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
        <div className={`min-h-0 border-line lg:flex lg:border-r ${selectedId ? 'hidden' : 'flex'} flex-col`}>
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
          />
        </div>

        <main className={`min-h-0 overflow-y-auto ${selectedId ? 'block' : 'hidden lg:block'}`}>
          {selectedId && (
            <button
              type="button"
              onClick={() => select(null)}
              className="m-4 mb-0 flex items-center gap-1 text-sm text-muted hover:text-foreground lg:hidden"
            >
              <Icon name="chevronLeft" className="size-4" /> กลับไปรายชื่อ
            </button>
          )}
          {!selectedId && (
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
    </div>
  );
}
