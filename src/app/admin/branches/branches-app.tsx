'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Branch, BranchInput } from '@/lib/admin/branches-service';
import { Button, ErrorText, Icon, Spinner } from '@/components/ui';
import { adminFetch } from '../admin-lib';

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

const EMPTY: BranchInput = {
  shopCode: '',
  shopName: '',
  company: 'Com7',
  mainUnit: '',
  rsm: '',
  asm: '',
  province: '',
  region: '',
  ta: '',
  intern: '',
};

const FIELDS: Array<{ key: keyof BranchInput; label: string; wide?: boolean }> = [
  { key: 'shopCode', label: 'รหัสสาขา (ID)' },
  { key: 'shopName', label: 'ชื่อสาขา', wide: true },
  { key: 'company', label: 'บริษัท' },
  { key: 'mainUnit', label: 'หน่วยงานหลัก (BU)' },
  { key: 'province', label: 'จังหวัด' },
  { key: 'region', label: 'ภาค' },
  { key: 'rsm', label: 'RSM' },
  { key: 'asm', label: 'ASM' },
  { key: 'ta', label: 'TA' },
  { key: 'intern', label: 'Intern' },
];

export function BranchesApp() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [company, setCompany] = useState('');
  const [editing, setEditing] = useState<(BranchInput & { id?: number }) | null>(null);

  const apply = useCallback((r: Awaited<ReturnType<typeof adminFetch<Branch[]>>>) => {
    if (r.ok) {
      setBranches(r.data);
      setError(null);
    } else setError(r.error);
  }, []);
  useEffect(() => {
    adminFetch<Branch[]>('branches').then(apply);
  }, [apply]);
  const reload = () => adminFetch<Branch[]>('branches').then(apply);

  const companies = useMemo(() => [...new Set((branches ?? []).map((b) => b.company).filter(Boolean))].sort(), [branches]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (branches ?? []).filter(
      (b) =>
        (!company || b.company === company) &&
        (!needle ||
          [b.label, b.province, b.region, b.rsm, b.asm, b.ta, b.mainUnit].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [branches, q, company]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">สาขา</h1>
            <p className="text-sm text-muted">ใช้เลือกสาขาให้ผู้สมัคร และเลือกเทมเพลตแจ้งเริ่มงานตามบริษัทของสาขา</p>
          </div>
          <Button onClick={() => setEditing({ ...EMPTY })} className="sm:w-auto">
            <Icon name="plus" className="size-4" /> เพิ่มสาขา
          </Button>
        </div>

        {editing && (
          <BranchForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา รหัส ชื่อสาขา จังหวัด ภาค RSM ASM TA"
            aria-label="ค้นหาสาขา"
            className={`${INPUT} max-w-md flex-1`}
          />
          <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="กรองตามบริษัท" className={`${INPUT} w-auto`}>
            <option value="">ทุกบริษัท</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="self-center text-sm text-muted">{branches ? `${shown.length.toLocaleString('th-TH')} สาขา` : ''}</span>
        </div>

        <ErrorText>{error}</ErrorText>
        {!branches && !error && (
          <p className="flex items-center gap-2 text-muted" role="status">
            <Spinner className="size-5" /> กำลังโหลด...
          </p>
        )}

        {branches && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">สาขา</th>
                  <th className="px-3 py-2 font-semibold">บริษัท / BU</th>
                  <th className="px-3 py-2 font-semibold">จังหวัด / ภาค</th>
                  <th className="px-3 py-2 font-semibold">RSM / ASM</th>
                  <th className="px-3 py-2 font-semibold">TA / Intern</th>
                  <th className="px-3 py-2 text-right font-semibold">ผู้สมัคร</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((b) => (
                  <BranchRow key={b.id} branch={b} onEdit={() => setEditing({ ...b })} onDeleted={reload} />
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <p className="p-6 text-center text-sm text-muted">ไม่พบสาขา</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function BranchRow({ branch: b, onEdit, onDeleted }: { branch: Branch; onEdit: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    const warn = b.applicantCount ? `\nมีผู้สมัคร ${b.applicantCount} คนอ้างถึงสาขานี้ (ชื่อสาขาในข้อมูลผู้สมัครยังอยู่)` : '';
    if (!window.confirm(`ลบสาขา ${b.label}?${warn}`)) return;
    setBusy(true);
    const r = await adminFetch(`branches/${b.id}/delete`, { method: 'POST', body: {} });
    setBusy(false);
    if (!r.ok) return window.alert(r.error);
    onDeleted();
  }
  const pair = (a: string, c: string) => [a, c].filter(Boolean).join(' / ') || '-';
  return (
    <tr className="hover:bg-surface/60">
      <td className="px-3 py-2">
        <p className="font-medium">{b.shopName}</p>
        <p className="text-xs text-muted">{b.shopCode || 'ไม่มีรหัส'}</p>
      </td>
      <td className="px-3 py-2">{pair(b.company, b.mainUnit)}</td>
      <td className="px-3 py-2">{pair(b.province, b.region)}</td>
      <td className="px-3 py-2">{pair(b.rsm, b.asm)}</td>
      <td className="px-3 py-2">{pair(b.ta, b.intern)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{b.applicantCount}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <button type="button" onClick={onEdit} className="rounded px-2 py-1 text-brand hover:bg-brand-tint">
          แก้ไข
        </button>
        <button type="button" disabled={busy} onClick={remove} className="rounded px-2 py-1 text-danger hover:bg-danger-tint disabled:opacity-50">
          ลบ
        </button>
      </td>
    </tr>
  );
}

function BranchForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: BranchInput & { id?: number };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await adminFetch<Branch>('branches', { method: 'POST', body: f });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved();
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-brand/40 bg-brand-tint/40 p-4">
      <h2 className="font-semibold">{initial.id ? `แก้ไขสาขา ${initial.shopName}` : 'เพิ่มสาขา'}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((fd) => (
          <label key={fd.key} className={`block space-y-1 ${fd.wide ? 'sm:col-span-2' : ''}`}>
            <span className="text-sm font-medium">{fd.label}</span>
            <input
              value={f[fd.key]}
              onChange={(e) => setF({ ...f, [fd.key]: e.target.value })}
              list={fd.key === 'company' ? 'company-options' : undefined}
              className={INPUT}
            />
          </label>
        ))}
        <datalist id="company-options">
          <option value="Com7" />
          <option value="Double7" />
        </datalist>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
          {busy ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
