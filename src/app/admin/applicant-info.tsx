'use client';

import { useEffect, useState } from 'react';
import { isoToBangkokLocal } from '@/lib/admin/dates';
import { branchLockedFields, exactBranch } from '@/lib/admin/onboarding';
import type { ApplicantDetail, ApplicantInfoInput, BranchOption } from '@/lib/admin/types';
import { ErrorText } from '@/components/ui';
import { adminFetch, fmtDateTime } from './admin-lib';
import { BranchPicker } from './branch-picker';

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

type Form = Required<Omit<ApplicantInfoInput, 'deadline' | 'startDate'>> & { deadline: string; startDate: string };

const empty: Form = { name: '', phone: '', branch: '', notes: '', deadline: '', ta: '', intern: '', company: '', position: '', startDate: '' };

export function fromDetail(d: ApplicantDetail): Form {
  return {
    name: d.name,
    phone: d.phone,
    branch: d.info.branch,
    notes: d.info.notes,
    deadline: isoToBangkokLocal(d.info.deadline),
    ta: d.info.ta,
    intern: d.info.intern,
    company: d.info.company,
    position: d.info.position,
    startDate: d.info.startDate ?? '',
  };
}

let branchCache: BranchOption[] | null = null;
function useBranches() {
  const [list, setList] = useState<BranchOption[]>(branchCache ?? []);
  useEffect(() => {
    if (branchCache) return;
    adminFetch<BranchOption[]>('branches/options').then((r) => {
      if (r.ok) {
        branchCache = r.data;
        setList(r.data);
      }
    });
  }, []);
  return list;
}

/** ฟอร์มข้อมูลผู้สมัคร — ใช้ทั้งเพิ่มใหม่และแก้ไข */
export function ApplicantInfoForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Form;
  submitLabel: string;
  onSubmit: (input: ApplicantInfoInput) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<Form>(initial ?? empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branches = useBranches();
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  // เลือกสาขาจากรายการ → บริษัท / TA / Intern ตามตารางสาขา (แก้เองไม่ได้)
  // (ข้อมูลเดิมที่ชื่อสาขาสะกดต่างจากตาราง ก็จับคู่ด้วยรหัสสาขาได้)
  const branch = exactBranch(f.branch, branches);
  const locked = branch ? branchLockedFields(branch) : {};
  // ค่าที่แสดง/บันทึก = ค่าตามสาขาทับค่าในฟอร์ม (คนที่มีสาขาอยู่แล้วแต่ TA ยังว่าง ก็เห็น TA ของสาขาทันที)
  const v: Form = { ...f, ...locked };
  const setBranch = (text: string) => setF({ ...f, branch: text });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await onSubmit({ ...v, phone: v.phone.replace(/\D/g, ''), startDate: v.startDate || null, deadline: v.deadline || null });
    setBusy(false);
    setError(err);
  }

  const field = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide = false) => {
    const byBranch = k in locked;
    return (
      <label className={`block space-y-1 ${wide ? 'sm:col-span-2' : ''}`}>
        <span className="text-sm font-medium">
          {label}
          {byBranch && <span className="font-normal text-muted"> · ตามสาขา</span>}
        </span>
        <input
          value={v[k]}
          onChange={set(k)}
          className={`${INPUT} ${byBranch ? 'bg-surface text-muted' : ''}`}
          {...props}
          readOnly={byBranch || props.readOnly}
        />
      </label>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {field('name', 'ชื่อ-นามสกุล', { required: true })}
        {field('phone', 'เบอร์โทร (ผู้สมัครใช้ผูก LINE)', { inputMode: 'numeric', placeholder: '08xxxxxxxx' })}
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">สาขา</span>
          <BranchPicker value={f.branch} branches={branches} onChange={setBranch} className={INPUT} />
        </label>
        {field('position', 'ตำแหน่ง')}
        {field('company', 'บริษัท (Com7 / Double7)', { list: 'applicant-company-options' })}
        {field('startDate', 'วันที่เริ่มงาน', { type: 'date' })}
        {field('deadline', 'กำหนดส่งเอกสาร (เวลาไทย)', { type: 'datetime-local' })}
        {field('ta', 'TA')}
        {field('intern', 'Intern')}
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">หมายเหตุภายใน (ผู้สมัครไม่เห็น)</span>
          <textarea value={f.notes} onChange={set('notes')} rows={2} className={`${INPUT} h-auto py-2`} />
        </label>
      </div>
      <datalist id="applicant-company-options">
        <option value="Com7" />
        <option value="Double7" />
      </datalist>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !f.name.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
          {busy ? 'กำลังบันทึก...' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

/** การ์ดข้อมูลผู้สมัคร (ดู/แก้) ในหน้ารายละเอียด */
export function InfoCard({ detail, onSave }: { detail: ApplicantDetail; onSave: (input: ApplicantInfoInput) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const i = detail.info;
  const rows: Array<[string, string]> = [
    ['สาขา', i.branch],
    ['ตำแหน่ง', i.position],
    ['บริษัท', i.company],
    ['วันเริ่มงาน', i.startDate ?? ''],
    ['กำหนดส่งเอกสาร', i.deadline ? fmtDateTime(i.deadline) : ''],
    ['TA / Intern', [i.ta, i.intern].filter(Boolean).join(' / ')],
    ['หมายเหตุภายใน', i.notes],
  ];
  return (
    <section className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">ข้อมูลผู้สมัคร</h3>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="rounded px-2 py-1 text-sm text-brand hover:bg-brand-tint">
            แก้ไข
          </button>
        )}
      </div>
      {editing ? (
        <ApplicantInfoForm
          initial={fromDetail(detail)}
          submitLabel="บันทึก"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            const err = await onSave(input);
            if (!err) setEditing(false);
            return err;
          }}
        />
      ) : (
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[130px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="whitespace-pre-wrap">{v || <span className="text-muted">-</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** ลบผู้สมัครถาวร — พิมพ์รหัสผู้สมัครเพื่อยืนยัน */
export function DeleteCard({ code, onDelete }: { code: string; onDelete: (confirmCode: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted underline underline-offset-2 hover:text-danger">
        ลบผู้สมัครนี้
      </button>
    );
  }
  return (
    <section className="space-y-3 rounded-xl border border-danger/40 p-4">
      <h3 className="font-semibold text-danger">ลบผู้สมัครถาวร</h3>
      <p className="text-sm text-muted">
        ลบข้อมูลและไฟล์เอกสารทั้งหมดของผู้สมัครนี้ กู้คืนไม่ได้ — ใช้เมื่อผู้สมัครขอลบข้อมูล (PDPA) หรือบันทึกผิด พิมพ์ <b>{code}</b> เพื่อยืนยัน
      </p>
      <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="พิมพ์รหัสผู้สมัครเพื่อยืนยัน" className={INPUT} />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || typed.trim() !== code}
          onClick={async () => {
            setBusy(true);
            setError(await onDelete(typed.trim()));
            setBusy(false);
          }}
          className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'กำลังลบ...' : 'ลบถาวร'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface">
          ยกเลิก
        </button>
      </div>
    </section>
  );
}
