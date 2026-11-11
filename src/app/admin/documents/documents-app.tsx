'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DocTypeSetting } from '@/lib/admin/documents-service';
import { Badge, Button, ErrorText, Icon, Spinner } from '@/components/ui';
import { adminFetch } from '../admin-lib';

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

type Draft = {
  key?: string;
  label: string;
  description: string;
  enabled: boolean;
  optional: boolean;
  coversAll: boolean;
  initial: boolean;
  subitems: Array<{ id: number; title: string; optional: boolean; kind: 'file' | 'check'; previousTitle: string | null; fileCount: number }>;
};

let seq = 0;
const toDraft = (d?: DocTypeSetting): Draft => ({
  key: d?.key,
  label: d?.label ?? '',
  description: d?.description ?? '',
  enabled: d?.enabled ?? true,
  optional: d?.optional ?? false,
  coversAll: d?.coversAll ?? false,
  initial: d?.initial ?? false,
  subitems: (d?.subitems ?? []).map((s) => ({ id: ++seq, title: s.title, optional: s.optional, kind: s.kind, previousTitle: s.title, fileCount: s.fileCount })),
});

export function DocumentsApp() {
  const [docs, setDocs] = useState<DocTypeSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const apply = useCallback((r: Awaited<ReturnType<typeof adminFetch<DocTypeSetting[]>>>) => {
    if (r.ok) {
      setDocs(r.data);
      setError(null);
      return true;
    }
    setError(r.error);
    return false;
  }, []);
  useEffect(() => {
    adminFetch<DocTypeSetting[]>('documents').then(apply);
  }, [apply]);

  async function act(key: string, path: string, body: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyKey(key);
    apply(await adminFetch<DocTypeSetting[]>(path, { method: 'POST', body }));
    setBusyKey(null);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">ตั้งค่าเอกสาร</h1>
            <p className="text-sm text-muted">
              รายการเอกสารที่ผู้สมัครต้องส่ง — ผู้สมัครที่ส่งครบไปแล้วจะไม่ถูกบังคับเอกสารที่เพิ่มทีหลัง
            </p>
            <p className="mt-1 text-sm text-muted">
              กลุ่มเอกสาร: ติ๊ก <b>เอกสารเบื้องต้น</b> ที่เอกสารที่ต้องการ — ผู้สมัครที่ตั้งเป็น &quot;ส่งเบื้องต้น&quot; จะเห็นเฉพาะเอกสารกลุ่มนี้
              ส่วน &quot;ส่งทั้งหมด&quot; เห็นทุกรายการ (ตั้งรายคนที่หน้าผู้สมัคร)
            </p>
          </div>
          {!editing && (
            <Button onClick={() => setEditing(toDraft())} className="sm:w-auto">
              <Icon name="plus" className="size-4" /> เพิ่มเอกสาร
            </Button>
          )}
        </div>

        <ErrorText>{error}</ErrorText>
        {docs && !docs.some((d) => d.initial && d.enabled && !d.coversAll) && (
          <p className="rounded-lg bg-warn-tint p-3 text-sm text-warn">
            ยังไม่ได้ตั้งเอกสารเบื้องต้น — ผู้สมัครที่ตั้งเป็น &quot;ส่งเบื้องต้น&quot; จะต้องส่งทั้งหมดไปก่อน
          </p>
        )}
        {editing && !editing.key && (
          <DocForm draft={editing} onCancel={() => setEditing(null)} onSaved={(d) => (apply({ ok: true, data: d }), setEditing(null))} />
        )}
        {!docs && !error && (
          <p className="flex items-center gap-2 text-muted" role="status">
            <Spinner className="size-5" /> กำลังโหลด...
          </p>
        )}

        <ol className="space-y-2">
          {docs?.map((d, i) =>
            editing?.key === d.key ? (
              <li key={d.key}>
                <DocForm draft={editing} onCancel={() => setEditing(null)} onSaved={(list) => (apply({ ok: true, data: list }), setEditing(null))} />
              </li>
            ) : (
              <li key={d.key} className={`flex gap-3 rounded-xl border border-line p-4 ${d.enabled ? '' : 'bg-surface'}`}>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-label={`เลื่อน ${d.label} ขึ้น`}
                    disabled={i === 0 || !!busyKey}
                    onClick={() => act(d.key, `documents/${d.key}/move`, { direction: 'up' })}
                    className="grid size-7 place-items-center rounded text-muted hover:bg-surface disabled:opacity-30"
                  >
                    <Icon name="chevronLeft" className="size-4 rotate-90" />
                  </button>
                  <button
                    type="button"
                    aria-label={`เลื่อน ${d.label} ลง`}
                    disabled={i === docs.length - 1 || !!busyKey}
                    onClick={() => act(d.key, `documents/${d.key}/move`, { direction: 'down' })}
                    className="grid size-7 place-items-center rounded text-muted hover:bg-surface disabled:opacity-30"
                  >
                    <Icon name="chevronLeft" className="size-4 -rotate-90" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-medium ${d.enabled ? '' : 'text-muted line-through'}`}>{d.label}</p>
                    {d.coversAll && <Badge tone="info">ไฟล์รวม</Badge>}
                    {d.initial && !d.coversAll && <Badge tone="brand">เบื้องต้น</Badge>}
                    {d.optional && !d.coversAll && <Badge tone="muted">ไม่บังคับ</Badge>}
                    {!d.enabled && <Badge tone="warn">ปิดใช้งาน</Badge>}
                  </div>
                  {d.description && <p className="mt-0.5 text-sm text-muted">{d.description}</p>}
                  {d.subitems.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {d.subitems.map((s) => (
                        <li key={s.title} className={`rounded-full px-2.5 py-0.5 text-xs ${s.kind === 'check' ? 'border border-dashed border-line text-muted' : 'bg-surface'}`}>
                          {s.kind === 'check' ? `✓ ${s.title}` : s.title}
                          {s.optional && s.kind === 'file' && ' (ถ้ามี)'}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1.5 text-xs text-muted">
                    key: {d.key} · ไฟล์ปัจจุบัน {d.fileCount + d.subitems.reduce((n, s) => n + s.fileCount, 0)} ไฟล์
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  <button type="button" onClick={() => setEditing(toDraft(d))} className="rounded px-2 py-1 text-brand hover:bg-brand-tint">
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    disabled={busyKey === d.key}
                    onClick={() =>
                      act(
                        d.key,
                        'documents',
                        { ...toDraftPayload(toDraft(d)), enabled: !d.enabled },
                        d.enabled ? `ปิดใช้งาน "${d.label}"? ผู้สมัครที่ยังไม่ส่งครบจะไม่เห็นเอกสารนี้` : undefined,
                      )
                    }
                    className="rounded px-2 py-1 text-muted hover:bg-surface"
                  >
                    {d.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                  {!d.coversAll && (
                    <button
                      type="button"
                      disabled={busyKey === d.key}
                      onClick={() => act(d.key, `documents/${d.key}/delete`, {}, `ลบเอกสาร "${d.label}" ถาวร?`)}
                      className="rounded px-2 py-1 text-danger hover:bg-danger-tint"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              </li>
            ),
          )}
        </ol>
      </div>
    </div>
  );
}

const toDraftPayload = (d: Draft) => ({
  key: d.key,
  label: d.label,
  description: d.description,
  enabled: d.enabled,
  optional: d.optional,
  initial: d.initial,
  subitems: d.subitems.map((s) => ({ title: s.title, optional: s.optional, kind: s.kind, previousTitle: s.previousTitle })),
});

function DocForm({ draft, onCancel, onSaved }: { draft: Draft; onCancel: () => void; onSaved: (list: DocTypeSetting[]) => void }) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSub = (id: number, patch: Partial<Draft['subitems'][number]>) =>
    setD({ ...d, subitems: d.subitems.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const removeSub = (id: number) => {
    const s = d.subitems.find((x) => x.id === id);
    if (s?.fileCount && !window.confirm(`หัวข้อ "${s.title}" มีไฟล์ของผู้สมัคร ${s.fileCount} ไฟล์ — ลบหัวข้อแล้วไฟล์จะไม่นับในสถานะอีก (ไฟล์ยังเก็บไว้) ต้องการลบหรือไม่?`)) return;
    setD({ ...d, subitems: d.subitems.filter((x) => x.id !== id) });
  };
  const moveSub = (i: number, dir: -1 | 1) => {
    const list = [...d.subitems];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setD({ ...d, subitems: list });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await adminFetch<DocTypeSetting[]>('documents', { method: 'POST', body: toDraftPayload(d) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved(r.data);
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-brand/40 bg-brand-tint/40 p-4">
      <h2 className="font-semibold">{d.key ? `แก้ไข ${draft.label}` : 'เพิ่มเอกสาร'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">ชื่อเอกสาร (ขึ้นต้นด้วยเลขเพื่อจัดลำดับได้ เช่น &quot;13. ใบรับรองแพทย์&quot;)</span>
          <input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} className={INPUT} required />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">คำอธิบาย (ผู้สมัครเห็น)</span>
          <input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className={INPUT} />
        </label>
        {!d.coversAll && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.optional} onChange={(e) => setD({ ...d, optional: e.target.checked })} className="size-4 accent-brand" />
            ไม่บังคับ (ไม่นับในความครบถ้วน)
          </label>
        )}
        {!d.coversAll && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.initial} onChange={(e) => setD({ ...d, initial: e.target.checked })} className="size-4 accent-brand" />
            เอกสารเบื้องต้น (อยู่ในชุด &quot;ส่งเบื้องต้น&quot;)
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} className="size-4 accent-brand" />
          เปิดใช้งาน
        </label>
      </div>

      {!d.coversAll && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">หัวข้อย่อย</legend>
          <p className="text-xs text-muted">
            <b>ช่องอัปโหลด</b> = ผู้สมัครแนบไฟล์แยกช่องละ 1 ไฟล์ (เช่น หน้าที่ 1, 2, 3) · <b>HR ตรวจ</b> = จุดที่ HR เช็คในไฟล์ (เช่น เซ็นรับรอง)
            ผู้สมัครไม่ต้องอัปโหลดแยก แต่จะเห็นเป็นข้อแนะนำก่อนส่ง
          </p>
          {d.subitems.length === 0 && <p className="text-sm text-muted">ไม่มีหัวข้อย่อย — ผู้สมัครแนบไฟล์ของเอกสารนี้ได้หลายไฟล์ในช่องเดียว</p>}
          {d.subitems.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <div className="flex">
                <button type="button" aria-label="เลื่อนขึ้น" onClick={() => moveSub(i, -1)} className="grid size-8 place-items-center rounded text-muted hover:bg-surface">
                  <Icon name="chevronLeft" className="size-4 rotate-90" />
                </button>
                <button type="button" aria-label="เลื่อนลง" onClick={() => moveSub(i, 1)} className="grid size-8 place-items-center rounded text-muted hover:bg-surface">
                  <Icon name="chevronLeft" className="size-4 -rotate-90" />
                </button>
              </div>
              <input
                value={s.title}
                onChange={(e) => setSub(s.id, { title: e.target.value })}
                aria-label={`ชื่อหัวข้อย่อยที่ ${i + 1}`}
                className={`${INPUT} min-w-48 flex-1`}
              />
              <select
                value={s.kind}
                onChange={(e) => setSub(s.id, { kind: e.target.value as 'file' | 'check' })}
                aria-label={`ชนิดของหัวข้อ ${s.title}`}
                className="h-10 rounded-lg border border-line bg-background px-2 text-sm"
              >
                <option value="file">ช่องอัปโหลด</option>
                <option value="check">HR ตรวจ</option>
              </select>
              {s.kind === 'file' && (
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={s.optional} onChange={(e) => setSub(s.id, { optional: e.target.checked })} className="size-4 accent-brand" />
                  ถ้ามี
                </label>
              )}
              {s.fileCount > 0 && <span className="text-xs text-muted">{s.fileCount} ไฟล์</span>}
              <button type="button" onClick={() => removeSub(s.id)} aria-label={`ลบหัวข้อ ${s.title}`} className="grid size-8 place-items-center rounded text-danger hover:bg-danger-tint">
                <Icon name="x" className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setD({ ...d, subitems: [...d.subitems, { id: ++seq, title: '', optional: false, kind: 'file', previousTitle: null, fileCount: 0 }] })}
            className="flex items-center gap-1 text-sm font-medium text-brand"
          >
            <Icon name="plus" className="size-4" /> เพิ่มหัวข้อย่อย
          </button>
          {d.subitems.some((s) => s.previousTitle && s.previousTitle !== s.title && s.fileCount > 0) && (
            <p className="text-xs text-muted">เปลี่ยนชื่อหัวข้อที่มีไฟล์แล้ว — ไฟล์และผลตรวจเดิมจะย้ายไปอยู่กับชื่อใหม่ให้อัตโนมัติ</p>
          )}
        </fieldset>
      )}

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
