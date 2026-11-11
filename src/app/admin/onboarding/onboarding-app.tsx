'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  branchLockedFields,
  fillTemplate,
  formatThaiDate,
  missingOnboardFields,
  resolveTemplateKey,
  type OnboardTemplates,
} from '@/lib/admin/onboarding';
import { canEditAfterOnboard, canSendOnboarding } from '@/lib/admin/roles';
import type { BranchOption, OnboardingData, OnboardingItem } from '@/lib/admin/types';
import { Badge, Button, ErrorText, Icon, Spinner } from '@/components/ui';
import { adminFetch, fmtDateTime } from '../admin-lib';
import { useAdmin } from '../shell';

type Tab = 'pending' | 'sent';

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export function OnboardingApp() {
  const me = useAdmin();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  // ?tab=sent จากหน้าภาพรวม (แจ้งเริ่มงานแล้ว) — อ่านจาก URL ทุกครั้ง เพราะ Next เก็บหน้านี้ไว้ไม่ unmount (cacheComponents)
  const tab: Tab = useSearchParams().get('tab') === 'sent' ? 'sent' : 'pending';
  const setTab = (t: Tab) => {
    const url = new URL(window.location.href);
    if (t === 'sent') url.searchParams.set('tab', 'sent');
    else url.searchParams.delete('tab');
    window.history.replaceState(null, '', url);
  };
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ busy: boolean; result: string | null }>({ busy: false, result: null });

  const applyResult = useCallback((r: Awaited<ReturnType<typeof adminFetch<OnboardingData>>>) => {
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
  }, []);
  const load = useCallback(() => adminFetch<OnboardingData>('onboarding').then(applyResult), [applyResult]);

  useEffect(() => {
    adminFetch<OnboardingData>('onboarding').then(applyResult);
    adminFetch<BranchOption[]>('branches/options').then((r) => r.ok && setBranches(r.data));
  }, [applyResult]);

  const replaceItem = (item: OnboardingItem) =>
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === item.id ? item : i)) } : d));

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const needle = q.trim().toLowerCase();
    return items
      .filter((i) => (tab === 'pending' ? !i.notifiedAt : !!i.notifiedAt))
      .filter((i) => !needle || [i.name, i.phone, i.branch, i.code].some((v) => v.toLowerCase().includes(needle)));
  }, [data, tab, q]);

  const pending = data?.items.filter((i) => !i.notifiedAt) ?? [];
  const ready = pending.filter((i) => i.lineLinked && missingOnboardFields(i).length === 0);
  const canSend = canSendOnboarding(me.role);

  async function sendAll() {
    if (!window.confirm(`ส่งแจ้งเตือนเริ่มงานทาง LINE ให้ ${ready.length} คนที่ข้อมูลครบ?`)) return;
    setBulk({ busy: true, result: null });
    const r = await adminFetch<{ sent: number; total: number; failed: Array<{ name: string; error: string }> }>('onboarding/send-all', {
      method: 'POST',
      body: {},
    });
    setBulk({
      busy: false,
      result: r.ok
        ? `ส่งสำเร็จ ${r.data.sent}/${r.data.total} คน` +
          (r.data.failed.length ? ` · ไม่สำเร็จ: ${r.data.failed.map((f) => `${f.name} (${f.error})`).join(', ')}` : '')
        : r.error,
    });
    load();
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">แจ้งเริ่มงาน</h1>
            <p className="text-sm text-muted">ผู้สมัครที่เอกสารอนุมัติครบทุกรายการ — กรอกข้อมูลเริ่มงานแล้วส่งการ์ดยืนยันทาง LINE</p>
          </div>
          {canSend && ready.length > 0 && (
            <Button busy={bulk.busy} onClick={sendAll} className="sm:w-auto">
              ส่งทุกคนที่พร้อม ({ready.length})
            </Button>
          )}
        </div>
        {!canSend && (
          <p className="rounded-lg bg-surface p-3 text-sm text-muted">บัญชี Admin แก้ไขข้อมูลเริ่มงานได้ แต่การส่งแจ้งเตือนต้องเป็น Admin2 ขึ้นไป</p>
        )}
        {bulk.result && <p className="rounded-lg bg-info-tint p-3 text-sm text-info">{bulk.result}</p>}
        <ErrorText>{error}</ErrorText>

        <div className="flex flex-wrap items-center gap-2">
          {(['pending', 'sent'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${tab === t ? 'bg-foreground text-background' : 'bg-surface text-muted hover:text-foreground'}`}
            >
              {t === 'pending' ? `รอส่ง (${pending.length})` : `ส่งแล้ว (${(data?.items.length ?? 0) - pending.length})`}
            </button>
          ))}
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์ สาขา"
            aria-label="ค้นหา"
            className={`${INPUT} ml-auto max-w-xs`}
          />
        </div>

        {!data && !error && (
          <p className="flex items-center gap-2 text-muted" role="status">
            <Spinner className="size-5" /> กำลังโหลด...
          </p>
        )}
        {data && filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
            {tab === 'pending' ? 'ยังไม่มีผู้สมัครที่เอกสารอนุมัติครบและรอแจ้งเริ่มงาน' : 'ยังไม่มีรายการที่ส่งแล้ว'}
          </p>
        )}

        <ul className="space-y-2">
          {filtered.map((item) => (
            <OnboardingRow
              key={item.id}
              item={item}
              open={openId === item.id}
              onToggle={() => setOpenId(openId === item.id ? null : item.id)}
              templates={data!.templates}
              branches={branches}
              canSend={canSend}
              canEdit={!item.notifiedAt || canEditAfterOnboard(me.role)}
              onChange={replaceItem}
              onSent={load}
            />
          ))}
        </ul>

        {canSend && data && <TemplateEditor templates={data.templates} onSaved={(t) => setData({ ...data, templates: t })} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OnboardingRow({
  item,
  open,
  onToggle,
  templates,
  branches,
  canSend,
  canEdit,
  onChange,
  onSent,
}: {
  item: OnboardingItem;
  open: boolean;
  onToggle: () => void;
  templates: OnboardTemplates;
  branches: BranchOption[];
  canSend: boolean;
  canEdit: boolean;
  onChange: (i: OnboardingItem) => void;
  onSent: () => void;
}) {
  const missing = missingOnboardFields(item);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templateKey = resolveTemplateKey(item.company, templates);

  async function send() {
    const again = !!item.notifiedAt;
    if (!window.confirm(`${again ? 'ส่งซ้ำ' : 'ส่ง'}แจ้งเตือนเริ่มงานให้คุณ${item.name}ทาง LINE?`)) return;
    setSending(true);
    const r = await adminFetch<{ notifiedAt: string }>(`onboarding/${item.id}/send`, { method: 'POST', body: {} });
    setSending(false);
    if (!r.ok) return setError(r.error);
    setError(null);
    onSent();
  }

  return (
    <li className="rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <p className="font-medium">
            {item.name} <span className="text-xs font-normal text-muted">{item.code}</span>
          </p>
          <p className="mt-0.5 text-sm text-muted">
            เริ่มงาน {formatThaiDate(item.startDate)} · {item.position || 'ไม่ระบุตำแหน่ง'} · {item.branch || 'ไม่ระบุสาขา'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="muted">{templates[templateKey]?.label ?? templateKey}</Badge>
            {!item.lineLinked && <Badge tone="danger">ไม่มี LINE</Badge>}
            {missing.length > 0 && <Badge tone="warn">ขาด {missing.join(', ')}</Badge>}
            {item.notifiedAt && <Badge tone="brand">ส่งแล้ว {fmtDateTime(item.notifiedAt)}</Badge>}
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Link href={`/admin?id=${item.id}`} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface">
            เอกสาร
          </Link>
          <button type="button" onClick={onToggle} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface">
            {open ? 'ปิด' : canEdit ? 'แก้ไข' : 'ดู'}
          </button>
          {canSend && (
            <button
              type="button"
              disabled={sending || missing.length > 0 || !item.lineLinked}
              onClick={send}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:bg-line disabled:text-muted"
            >
              {sending ? 'กำลังส่ง...' : item.notifiedAt ? 'ส่งซ้ำ' : 'ส่ง LINE'}
            </button>
          )}
        </div>
        {error && (
          <div className="w-full">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
      </div>
      {open && (
        <OnboardingForm item={item} templates={templates} branches={branches} readOnly={!canEdit} onSaved={onChange} />
      )}
    </li>
  );
}

function OnboardingForm({
  item,
  templates,
  branches,
  readOnly,
  onSaved,
}: {
  item: OnboardingItem;
  templates: OnboardTemplates;
  branches: BranchOption[];
  readOnly: boolean;
  onSaved: (i: OnboardingItem) => void;
}) {
  const [f, setF] = useState({
    startDate: item.startDate ?? '',
    position: item.position,
    branch: item.branch,
    company: item.company,
    salary: item.salary?.toString() ?? '',
    ta: item.ta,
    notes: item.notes,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    setSaved(false);
  };

  // เลือกสาขาจากรายการ → บริษัท / TA ตามตารางสาขา (แก้เองไม่ได้)
  const branch = branches.find((b) => b.label === f.branch.trim()) ?? null;
  const locked = branch ? branchLockedFields(branch) : null;
  const branchCompany = locked?.company ?? '';
  const setBranch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const b = branches.find((x) => x.label === e.target.value.trim());
    const l = b ? branchLockedFields(b) : null;
    setF({ ...f, branch: e.target.value, ...(l ? { company: l.company, ...(l.ta ? { ta: l.ta } : {}) } : {}) });
    setSaved(false);
  };
  const preview = useMemo(() => {
    const emp = {
      ...item,
      ...f,
      company: f.company || branchCompany,
      startDate: f.startDate || null,
      salary: f.salary ? Number(f.salary) : null,
    };
    const tpl = templates[resolveTemplateKey(emp.company, templates)] ?? templates.Default;
    return fillTemplate(tpl.template, emp);
  }, [f, item, templates, branchCompany]);

  async function save() {
    setBusy(true);
    const r = await adminFetch<OnboardingItem>(`onboarding/${item.id}`, {
      method: 'POST',
      body: { ...f, startDate: f.startDate || null, salary: f.salary === '' ? null : Number(f.salary) },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setError(null);
    setSaved(true);
    onSaved(r.data);
  }

  const listId = `branches-${item.id}`;
  return (
    <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
      <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2">
        <Field label="วันที่เริ่มงาน">
          <input type="date" value={f.startDate} onChange={set('startDate')} className={INPUT} />
        </Field>
        <Field label="ตำแหน่ง">
          <input value={f.position} onChange={set('position')} className={INPUT} />
        </Field>
        <Field label="สาขา" wide>
          <input value={f.branch} onChange={setBranch} list={listId} className={INPUT} placeholder="พิมพ์เพื่อค้นหาสาขา" />
          <datalist id={listId}>
            {branches.map((b) => (
              <option key={b.id} value={b.label} />
            ))}
          </datalist>
        </Field>
        <Field label={locked ? 'บริษัท · ตามสาขา' : 'บริษัท (เลือกเทมเพลต)'}>
          <select value={f.company} onChange={set('company')} disabled={!!locked} className={INPUT}>
            <option value="">{branchCompany ? `ตามสาขา (${branchCompany})` : 'ตามสาขา'}</option>
            {Object.entries(templates)
              .filter(([k]) => k !== 'Default')
              .map(([k, t]) => (
                <option key={k} value={k}>
                  {t.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="เงินเดือน (บาท)">
          <input type="number" inputMode="numeric" min={0} value={f.salary} onChange={set('salary')} className={INPUT} />
        </Field>
        <Field label={locked?.ta ? 'TA · ตามสาขา' : 'TA'}>
          <input value={f.ta} onChange={set('ta')} readOnly={!!locked?.ta} className={`${INPUT} ${locked?.ta ? 'bg-surface text-muted' : ''}`} />
        </Field>
        <Field label="หมายเหตุเพิ่มเติม (ผู้สมัครเห็น)" wide>
          <textarea value={f.notes} onChange={set('notes')} rows={3} className={`${INPUT} h-auto py-2`} />
        </Field>
        {!readOnly && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
            >
              {busy ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            {saved && <span className="text-sm text-brand">บันทึกแล้ว</span>}
            {item.updatedBy && <span className="text-xs text-muted">แก้ล่าสุดโดย {item.updatedBy} · {fmtDateTime(item.updatedAt)}</span>}
          </div>
        )}
        {readOnly && <p className="text-sm text-muted sm:col-span-2">ส่งแจ้งเตือนแล้ว — แก้ไขได้เฉพาะ SuperAdmin ขึ้นไป</p>}
        <div className="sm:col-span-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </fieldset>
      <div>
        <p className="mb-1.5 text-sm font-semibold">ตัวอย่างข้อความ</p>
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface p-3 font-sans text-sm leading-relaxed">{preview}</pre>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------

function TemplateEditor({ templates, onSaved }: { templates: OnboardTemplates; onSaved: (t: OnboardTemplates) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(templates);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    const r = await adminFetch<OnboardTemplates>('onboarding/templates', { method: 'POST', body: { templates: draft } });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: 'บันทึกเทมเพลตแล้ว' });
    onSaved(r.data);
  }

  return (
    <section className="rounded-xl border border-line">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between p-4 text-left">
        <span className="font-semibold">เทมเพลตข้อความแจ้งเริ่มงาน</span>
        <Icon name="chevronRight" className={`size-5 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <p className="text-sm text-muted">
            ตัวแปรที่ใช้ได้: {'{{name}} {{startDate}} {{position}} {{branch}} {{salary}} {{ta}} {{phone}} {{company}} {{notes}}'} —
            ข้อความในส่วน &quot;หมายเหตุ&quot; จะแสดงในกล่องหมายเหตุของการ์ด และลิงก์แรกที่พบจะกลายเป็นปุ่ม
          </p>
          {Object.entries(draft).map(([key, t]) => (
            <label key={key} className="block space-y-1">
              <span className="text-sm font-medium">{t.label}</span>
              <textarea
                value={t.template}
                onChange={(e) => setDraft({ ...draft, [key]: { ...t, template: e.target.value } })}
                rows={10}
                className="w-full rounded-lg border border-line bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-brand"
              />
            </label>
          ))}
          {msg && <p className={`text-sm ${msg.ok ? 'text-brand' : 'text-danger'}`}>{msg.text}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          >
            {busy ? 'กำลังบันทึก...' : 'บันทึกเทมเพลต'}
          </button>
        </div>
      )}
    </section>
  );
}
