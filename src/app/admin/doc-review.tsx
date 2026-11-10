'use client';

/**
 * ตรวจเอกสารของผู้สมัคร — เลือกผล (ผ่าน/ไม่ผ่าน) ไว้ก่อน แล้วกดบันทึกครั้งเดียว
 * ระบบส่ง LINE ครั้งเดียวต่อการบันทึก (เฉพาะรายการที่ต้องแก้ / ตอนผ่านครบ)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminDocView, ApplicantDetail, FileView, ReviewItemInput } from '@/lib/admin/types';
import { Badge, docBadge, ErrorText, Icon } from '@/components/ui';
import { fmtDateTime, fmtSize } from './admin-lib';

const QUICK_REASONS = ['ภาพไม่ชัด', 'เอกสารไม่ครบ', 'ยังไม่ได้เซ็นรับรองสำเนา', 'เอกสารหมดอายุ', 'ส่งผิดเอกสาร'];

type Decision = { status: 'approved' | 'rejected'; reason: string };
type Drafts = Record<string, Decision>;
const slot = (docKey: string, sub = '') => `${docKey}\u0000${sub}`;
const parseSlot = (k: string) => {
  const [docKey, subitemTitle] = k.split('\u0000');
  return { docKey, subitemTitle };
};

interface ViewerFile {
  file: FileView;
  label: string;
  slotKey: string;
  checks: string[];
}

export function DocsReview({
  detail,
  onSave,
  onDirtyChange,
}: {
  detail: ApplicantDetail;
  onSave: (items: ReviewItemInput[], notify: boolean) => Promise<string | null>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const count = Object.keys(drafts).length;

  useEffect(() => onDirtyChange(count > 0), [count, onDirtyChange]);
  useEffect(() => {
    if (!count) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [count]);

  const decide = (key: string, d: Decision | null) =>
    setDrafts((cur) => {
      const next = { ...cur };
      if (d) next[key] = d;
      else delete next[key];
      return next;
    });

  // ไฟล์ทั้งหมดเรียงตามเอกสาร — ใช้เลื่อนดูในหน้าต่างดูไฟล์
  const allFiles = useMemo<ViewerFile[]>(
    () =>
      detail.docs.flatMap((d) => [
        ...d.files.map((file) => ({ file, label: d.label, slotKey: slot(d.key), checks: d.checks })),
        ...d.subitems.flatMap((s) => s.files.map((file) => ({ file, label: `${d.label} — ${s.title}`, slotKey: slot(d.key, s.title), checks: d.checks }))),
      ]),
    [detail.docs],
  );
  const openFile = (id: string) => setViewer(allFiles.findIndex((f) => f.file.id === id));

  /** ผ่านทุกช่องที่ส่งแล้ว/อยู่ในไฟล์รวม และยังไม่อนุมัติ */
  function approveAllPending() {
    const next: Drafts = { ...drafts };
    for (const d of detail.docs) {
      if (d.state === 'approved') continue;
      if (d.subitems.length === 0) {
        if (d.files.length > 0 || d.state === 'covered') next[slot(d.key)] ??= { status: 'approved', reason: '' };
        continue;
      }
      // ส่งครบทุกหัวข้อ หรืออยู่ในไฟล์รวม → ผ่านทั้งเอกสารทีเดียว / ส่งบางหัวข้อ → ผ่านเฉพาะหัวข้อที่ส่ง
      if (d.state === 'submitted' || d.state === 'covered') {
        next[slot(d.key)] ??= { status: 'approved', reason: '' };
      } else {
        for (const s of d.subitems) {
          if (s.files.length > 0 && s.state !== 'approved') next[slot(d.key, s.title)] ??= { status: 'approved', reason: '' };
        }
      }
    }
    setDrafts(next);
  }

  async function save() {
    setBusy(true);
    const items = Object.entries(drafts).map(([k, v]) => ({ ...parseSlot(k), status: v.status, reason: v.reason }));
    const err = await onSave(items, notify);
    setBusy(false);
    setError(err);
    if (!err) setDrafts({});
  }

  const pendingCount = detail.docs.filter((d) => d.state === 'submitted' || d.state === 'covered' || d.state === 'partial').length;

  return (
    <section aria-labelledby="docs-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="docs-title" className="font-semibold">
          เอกสาร <span className="font-normal text-muted">ส่งแล้ว {detail.satisfied}/{detail.total} รายการ</span>
        </h3>
        {pendingCount > 0 && (
          <button type="button" onClick={approveAllPending} className="rounded-lg border border-brand px-3 py-1.5 text-sm font-semibold text-brand-strong hover:bg-brand-tint">
            ผ่านทั้งหมดที่รอตรวจ
          </button>
        )}
      </div>

      {detail.docs.map((d) => (
        <DocCard key={d.key} doc={d} drafts={drafts} decide={decide} onOpenFile={openFile} />
      ))}

      {count > 0 && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          <p className="text-sm font-medium">
            ผลตรวจที่ยังไม่บันทึก {count} รายการ
            <span className="ml-2 font-normal text-muted">
              (ผ่าน {Object.values(drafts).filter((d) => d.status === 'approved').length} · ไม่ผ่าน{' '}
              {Object.values(drafts).filter((d) => d.status === 'rejected').length})
            </span>
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-brand" />
            แจ้งผู้สมัครทาง LINE
          </label>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setDrafts({})} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface">
              ล้าง
            </button>
            <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
              {busy ? 'กำลังบันทึก...' : 'บันทึกผลตรวจ'}
            </button>
          </div>
          {error && (
            <div className="w-full">
              <ErrorText>{error}</ErrorText>
            </div>
          )}
          {notify && (
            <p className="w-full text-xs text-muted">
              ผู้สมัครจะได้รับ LINE 1 ข้อความ เฉพาะเมื่อมีรายการที่ต้องแก้ หรือเมื่อเอกสารผ่านครบทุกรายการ
            </p>
          )}
        </div>
      )}

      {viewer !== null && viewer >= 0 && (
        <FileViewer files={allFiles} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} drafts={drafts} decide={decide} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function DocCard({
  doc,
  drafts,
  decide,
  onOpenFile,
}: {
  doc: AdminDocView;
  drafts: Drafts;
  decide: (key: string, d: Decision | null) => void;
  onOpenFile: (id: string) => void;
}) {
  const [ticked, setTicked] = useState<string[]>([]);
  const hasSubs = doc.subitems.length > 0;
  const covered = doc.state === 'covered';
  const anyFile = doc.files.length > 0 || doc.subitems.some((s) => s.files.length > 0);
  const tag = doc.coversAll ? 'ไฟล์รวม' : doc.optional ? 'ไม่บังคับ' : null;
  const unticked = doc.checks.filter((c) => !ticked.includes(c));
  const docDraft = drafts[slot(doc.key)];
  const badge = docBadge(doc.state, 0, 0);

  return (
    <div className={`rounded-xl border p-4 ${docDraft ? 'border-brand/50' : doc.state === 'rejected' ? 'border-danger/40' : 'border-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {doc.label}
            {tag && <span className="ml-2 text-xs font-normal text-muted">({tag})</span>}
          </p>
          {doc.reason && doc.state === 'rejected' && <p className="mt-0.5 text-sm text-danger">เหตุผลเดิม: {doc.reason}</p>}
          {doc.review?.reviewedBy && (
            <p className="text-xs text-muted">
              ตรวจโดย {doc.review.reviewedBy} · {fmtDateTime(doc.review.updatedAt)}
            </p>
          )}
        </div>
        <Badge tone={badge.tone}>{hasSubs && doc.state === 'partial' ? 'ส่งไม่ครบ' : badge.label}</Badge>
      </div>

      {doc.checks.length > 0 && (anyFile || covered) && (
        <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-surface px-3 py-2">
          <legend className="sr-only">จุดที่ต้องตรวจ</legend>
          <span className="text-xs font-semibold text-muted">ตรวจ:</span>
          {doc.checks.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={ticked.includes(c)}
                onChange={(e) => setTicked(e.target.checked ? [...ticked, c] : ticked.filter((x) => x !== c))}
                className="size-4 accent-brand"
              />
              {c}
            </label>
          ))}
        </fieldset>
      )}

      {covered && !anyFile && <p className="mt-2 text-sm text-info">อยู่ในไฟล์รวม — เปิดดูจากเอกสาร &quot;ไฟล์รวม&quot;</p>}

      {hasSubs ? (
        <div className="mt-3 space-y-2">
          {doc.subitems.map((s) => {
            const key = slot(doc.key, s.title);
            const sb = docBadge(s.state);
            return (
              <div key={s.title} className={`rounded-lg p-3 ${drafts[key] ? 'bg-brand-tint/50' : 'bg-surface'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {s.title}
                    {s.optional && <span className="ml-1 font-normal text-muted">(ถ้ามี)</span>}
                  </p>
                  <Badge tone={sb.tone}>{sb.label}</Badge>
                </div>
                {s.review?.status === 'rejected' && s.review.reason && <p className="mt-1 text-sm text-danger">เหตุผลเดิม: {s.review.reason}</p>}
                <FileStrip files={s.files} onOpen={onOpenFile} />
                {s.files.length > 0 && !docDraft && (
                  <DecisionControls current={s.state} draft={drafts[key]} unticked={unticked} onDecide={(d) => decide(key, d)} />
                )}
              </div>
            );
          })}
          {(anyFile || covered) && doc.state !== 'approved' && (
            <DecisionControls
              current={doc.state}
              draft={docDraft}
              unticked={unticked}
              approveLabel="ผ่านทั้งเอกสาร"
              onDecide={(d) => decide(slot(doc.key), d)}
            />
          )}
        </div>
      ) : (
        <>
          <FileStrip files={doc.files} onOpen={onOpenFile} />
          {doc.files.length > 0 || covered ? (
            <DecisionControls current={doc.state} draft={docDraft} unticked={unticked} onDecide={(d) => decide(slot(doc.key), d)} />
          ) : (
            <p className="mt-2 text-sm text-muted">ยังไม่มีไฟล์</p>
          )}
        </>
      )}
    </div>
  );
}

function FileStrip({ files, onOpen }: { files: FileView[]; onOpen: (id: string) => void }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {files.map((f, i) => {
        const isImage = !!f.mimeType?.startsWith('image/') && !f.legacy;
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onOpen(f.id)}
              title={`${f.mimeType ?? 'ไฟล์'} ${fmtSize(f.sizeBytes)} · ${fmtDateTime(f.createdAt)}`}
              className="group relative block size-20 overflow-hidden rounded-lg border border-line bg-background focus-visible:outline-2 focus-visible:outline-brand"
            >
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวที่ server สร้างใหม่ทุกครั้ง
                <img src={`/api/admin/files/${f.id}`} alt={`ไฟล์ที่ ${i + 1}`} loading="lazy" className="size-full object-cover" />
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center text-[11px] text-muted">
                  <Icon name="file" className="size-6" />
                  {f.legacy ? 'Drive (เดิม)' : f.mimeType === 'application/pdf' ? 'PDF' : 'ไฟล์'}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** ปุ่มเลือกผล (ยังไม่บันทึก) + ช่องเหตุผลเมื่อไม่ผ่าน */
function DecisionControls({
  current,
  draft,
  unticked,
  approveLabel = 'ผ่าน',
  onDecide,
}: {
  current: string;
  draft: Decision | undefined;
  unticked: string[];
  approveLabel?: string;
  onDecide: (d: Decision | null) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  if (draft) {
    return (
      <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${draft.status === 'approved' ? 'bg-brand-tint text-brand-strong' : 'bg-danger-tint text-danger'}`}>
        <Icon name={draft.status === 'approved' ? 'check' : 'x'} className="size-4" />
        <span className="font-semibold">{draft.status === 'approved' ? 'จะบันทึกว่าผ่าน' : 'จะบันทึกว่าไม่ผ่าน'}</span>
        {draft.reason && <span>— {draft.reason}</span>}
        <button type="button" onClick={() => onDecide(null)} className="ml-auto text-xs underline underline-offset-2">
          เปลี่ยน
        </button>
      </div>
    );
  }

  if (rejecting) {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm font-medium">เหตุผลที่ไม่ผ่าน (ผู้สมัครจะเห็นข้อความนี้)</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason((c) => (c ? `${c} ${r}` : r))} className="rounded-full border border-line px-2.5 py-0.5 text-xs hover:bg-surface">
              {r}
            </button>
          ))}
        </div>
        <textarea
          ref={inputRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          aria-label="เหตุผลที่ไม่ผ่าน"
          className="w-full rounded-lg border border-line bg-background p-2 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-danger/20"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => {
              onDecide({ status: 'rejected', reason: reason.trim() });
              setRejecting(false);
            }}
            className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            ไม่ผ่าน
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="rounded-lg px-4 py-1.5 text-sm text-muted hover:bg-surface">
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={current === 'approved'}
        onClick={() => {
          if (unticked.length && !window.confirm(`ยังไม่ได้ติ๊ก: ${unticked.join(', ')}\nยืนยันว่าผ่าน?`)) return;
          onDecide({ status: 'approved', reason: '' });
        }}
        className="rounded-lg border border-brand px-4 py-1.5 text-sm font-semibold text-brand-strong hover:bg-brand-tint disabled:border-line disabled:text-muted disabled:hover:bg-transparent"
      >
        {current === 'approved' ? 'ผ่านแล้ว' : approveLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          setReason(unticked.length ? `ยังไม่ผ่าน: ${unticked.join(', ')}` : '');
          setRejecting(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="rounded-lg border border-line px-4 py-1.5 text-sm font-semibold text-danger hover:bg-danger-tint"
      >
        ไม่ผ่าน
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** ดูไฟล์ในหน้าเดิม: เลื่อนซ้าย/ขวา (ปุ่มลูกศรบนคีย์บอร์ดได้) และเลือกผลของช่องนั้นได้เลย */
function FileViewer({
  files,
  index,
  onIndex,
  onClose,
  drafts,
  decide,
}: {
  files: ViewerFile[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  drafts: Drafts;
  decide: (key: string, d: Decision | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cur = files[index];
  const url = `/api/admin/files/${cur.file.id}`;
  const isImage = !!cur.file.mimeType?.startsWith('image/') && !cur.file.legacy;
  const isPdf = cur.file.mimeType === 'application/pdf' && !cur.file.legacy;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, files.length, onIndex]);

  const draft = drafts[cur.slotKey];
  return (
    <dialog ref={ref} onClose={onClose} aria-label="ดูไฟล์เอกสาร" className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/90 p-0 text-white backdrop:bg-black/70">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{cur.label}</span>
            <span className="ml-2 text-white/60">
              ไฟล์ {index + 1}/{files.length} · {fmtSize(cur.file.sizeBytes)}
            </span>
          </p>
          <a href={url} target="_blank" rel="noreferrer" className="rounded px-2 py-1 text-sm text-white/80 hover:bg-white/10">
            เปิดแท็บใหม่
          </a>
          <button type="button" onClick={() => ref.current?.close()} aria-label="ปิด" className="grid size-9 place-items-center rounded-full hover:bg-white/10">
            <Icon name="x" className="size-5" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวจาก server
            <img key={cur.file.id} src={url} alt={cur.label} className="max-h-full max-w-full object-contain" />
          ) : isPdf ? (
            <iframe key={cur.file.id} src={url} title={cur.label} className="size-full rounded bg-white" />
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-4 py-3 text-sm hover:bg-white/20">
              {cur.file.legacy ? 'เปิดไฟล์ใน Google Drive (ระบบเดิม)' : 'เปิดไฟล์'}
            </a>
          )}
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
            aria-label="ไฟล์ก่อนหน้า"
            className="absolute left-2 grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20"
          >
            <Icon name="chevronLeft" className="size-6" />
          </button>
          <button
            type="button"
            disabled={index === files.length - 1}
            onClick={() => onIndex(index + 1)}
            aria-label="ไฟล์ถัดไป"
            className="absolute right-2 grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20"
          >
            <Icon name="chevronRight" className="size-6" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white px-4 py-3 text-foreground dark:bg-background">
          {cur.checks.length > 0 && <span className="text-sm text-muted">ตรวจ: {cur.checks.join(' · ')}</span>}
          <div className="ml-auto min-w-64">
            <DecisionControls
              key={cur.slotKey}
              current=""
              draft={draft}
              unticked={[]}
              onDecide={(d) => {
                decide(cur.slotKey, d);
                if (d && index < files.length - 1) onIndex(index + 1);
              }}
            />
          </div>
        </div>
      </div>
    </dialog>
  );
}
