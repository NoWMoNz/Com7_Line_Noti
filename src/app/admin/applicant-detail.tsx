'use client';

import { useState } from 'react';
import type { AdminDocView, ApplicantDetail, FileView, ReviewItemInput, ReviewView } from '@/lib/admin/types';
import { Badge, Button, docBadge, ErrorText, Icon } from '@/components/ui';
import { fmtDateTime, fmtSize, STAGE } from './admin-lib';

/** เหตุผลที่ใช้บ่อย — กดแล้วเติมลงช่องเหตุผล */
const QUICK_REASONS = ['ภาพไม่ชัด', 'เอกสารไม่ครบ', 'ยังไม่ได้เซ็นรับรองสำเนา', 'เอกสารหมดอายุ', 'ส่งผิดเอกสาร'];

export interface DetailActions {
  /** คืนข้อความผิดพลาด หรือ null */
  review: (items: ReviewItemInput[], notify: boolean) => Promise<string | null>;
  approve: (approved: boolean, notify: boolean) => Promise<string | null>;
  feedback: (text: string, sendLine: boolean) => Promise<string | null>;
  unlinkLine: () => Promise<string | null>;
}

export function ApplicantDetailPanel({ detail, actions }: { detail: ApplicantDetail; actions: DetailActions }) {
  const stage = STAGE[detail.stage];
  const [notify, setNotify] = useState(true);

  return (
    <article className="space-y-6 p-4 lg:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{detail.name || '(ยังไม่กรอกชื่อ)'}</h2>
          <Badge tone={stage.tone}>{stage.label}</Badge>
        </div>
        <p className="text-sm text-muted">
          {detail.phone || 'ไม่มีเบอร์'} · {detail.code} · LINE {detail.lineLinked ? 'ผูกแล้ว' : 'ยังไม่ผูก'} · PDPA{' '}
          {detail.pdpaAcceptedAt ? `ยินยอมแล้ว (v${detail.pdpaVersion})` : 'ยังไม่ยินยอม'}
        </p>
        <p className="text-xs text-muted">
          ลงทะเบียน {fmtDateTime(detail.createdAt)} · ส่งเอกสารล่าสุด {fmtDateTime(detail.lastUploadedAt)}
          {detail.completedAt && ` · ส่งครบเมื่อ ${fmtDateTime(detail.completedAt)}`}
        </p>
      </header>

      <ApprovalCard detail={detail} onApprove={actions.approve} />

      {detail.approved && (
        <section aria-labelledby="docs-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="docs-title" className="font-semibold">
              เอกสาร <span className="font-normal text-muted">ส่งแล้ว {detail.satisfied}/{detail.total} รายการ</span>
            </h3>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-brand" />
              แจ้งผลการตรวจทาง LINE
            </label>
          </div>
          {detail.onboardNotified && (
            <p className="rounded-lg bg-brand-tint p-3 text-sm text-brand-strong">แจ้งเริ่มงานแล้ว — ผู้สมัครเห็นว่าเอกสารอนุมัติครบ</p>
          )}
          {detail.docs.map((d) => (
            <DocCard key={d.key} doc={d} onReview={(items) => actions.review(items, notify)} />
          ))}
        </section>
      )}

      <FeedbackCard key={detail.id} initial={detail.feedback} lineLinked={detail.lineLinked} onSave={actions.feedback} />
      {detail.lineLinked && <UnlinkCard onUnlink={actions.unlinkLine} />}
    </article>
  );
}

// ---------------------------------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-line p-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function ApprovalCard({ detail, onApprove }: { detail: ApplicantDetail; onApprove: DetailActions['approve'] }) {
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (approved: boolean) => {
    if (!approved && !window.confirm('ยกเลิกการอนุมัติ? ผู้สมัครจะแนบเอกสารไม่ได้จนกว่าจะอนุมัติอีกครั้ง')) return;
    setBusy(true);
    setError(await onApprove(approved, notify));
    setBusy(false);
  };

  if (detail.approved) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
        <p className="flex items-center gap-2 text-sm">
          <Icon name="check" className="size-4 text-brand" /> อนุมัติให้ส่งเอกสารแล้ว
        </p>
        <button type="button" disabled={busy} onClick={() => run(false)} className="text-sm text-muted underline underline-offset-2 hover:text-danger">
          ยกเลิกการอนุมัติ
        </button>
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }
  const noProfile = detail.stage === 'no_profile';
  return (
    <Card title="อนุมัติผู้สมัคร">
      <p className="text-sm text-muted">
        {noProfile
          ? 'ผู้สมัครยังไม่ได้กรอกชื่อและเบอร์โทร — อนุมัติได้ แต่ผู้สมัครต้องลงทะเบียนให้ครบก่อนจึงจะแนบเอกสารได้'
          : 'ตรวจข้อมูลผู้สมัครแล้ว อนุมัติเพื่อให้เริ่มแนบเอกสารได้'}
      </p>
      {detail.lineLinked && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-brand" />
          ส่งข้อความแจ้งผู้สมัครทาง LINE พร้อมลิงก์แนบเอกสาร
        </label>
      )}
      <ErrorText>{error}</ErrorText>
      <Button busy={busy} onClick={() => run(true)} className="sm:w-auto">
        อนุมัติให้ส่งเอกสาร
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// เอกสาร

function ReviewMeta({ review }: { review: ReviewView | null }) {
  if (!review || !review.reviewedBy) return null;
  return (
    <p className="text-xs text-muted">
      ตรวจโดย {review.reviewedBy} · {fmtDateTime(review.updatedAt)}
    </p>
  );
}

function DocCard({ doc, onReview }: { doc: AdminDocView; onReview: (items: ReviewItemInput[]) => Promise<string | null> }) {
  const badge = docBadge(doc.state, 0, 0);
  const hasSubs = doc.subitems.length > 0;
  const anyFile = doc.files.length > 0 || doc.subitems.some((s) => s.files.length > 0);
  const tag = doc.coversAll ? 'ไฟล์รวม' : doc.optional ? 'ไม่บังคับ' : null;

  return (
    <div className={`rounded-xl border p-4 ${doc.state === 'rejected' ? 'border-danger/40' : 'border-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {doc.label}
            {tag && <span className="ml-2 text-xs font-normal text-muted">({tag})</span>}
          </p>
          {doc.reason && doc.state === 'rejected' && <p className="mt-0.5 text-sm text-danger">เหตุผล: {doc.reason}</p>}
          <ReviewMeta review={doc.review} />
        </div>
        <Badge tone={badge.tone}>{hasSubs && doc.state === 'partial' ? 'ส่งไม่ครบ' : badge.label}</Badge>
      </div>

      {hasSubs ? (
        <div className="mt-3 space-y-3">
          {doc.subitems.map((s) => {
            const sb = docBadge(s.state);
            return (
              <div key={s.title} className="rounded-lg bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {s.title}
                    {s.optional && <span className="ml-1 font-normal text-muted">(ถ้ามี)</span>}
                  </p>
                  <Badge tone={sb.tone}>{sb.label}</Badge>
                </div>
                {s.review?.status === 'rejected' && s.review.reason && <p className="mt-1 text-sm text-danger">เหตุผล: {s.review.reason}</p>}
                <FileStrip files={s.files} />
                {s.files.length > 0 && (
                  <ReviewControls
                    current={s.state}
                    onReview={(status, reason) => onReview([{ docKey: doc.key, subitemTitle: s.title, status, reason }])}
                  />
                )}
              </div>
            );
          })}
          {anyFile && doc.state !== 'approved' && (
            <ApproveAllButton onClick={() => onReview([{ docKey: doc.key, subitemTitle: '', status: 'approved', reason: '' }])} />
          )}
        </div>
      ) : (
        <>
          <FileStrip files={doc.files} />
          {doc.files.length > 0 ? (
            <ReviewControls
              current={doc.state}
              onReview={(status, reason) => onReview([{ docKey: doc.key, subitemTitle: '', status, reason }])}
            />
          ) : (
            <p className="mt-2 text-sm text-muted">ยังไม่มีไฟล์</p>
          )}
        </>
      )}
    </div>
  );
}

function ApproveAllButton({ onClick }: { onClick: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await onClick());
          setBusy(false);
        }}
        className="text-sm font-semibold text-brand underline underline-offset-2 disabled:text-muted"
      >
        {busy ? 'กำลังบันทึก...' : 'ผ่านทั้งเอกสาร (ทุกหัวข้อ)'}
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function FileStrip({ files }: { files: FileView[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {files.map((f, i) => {
        const href = `/api/admin/files/${f.id}`;
        const isImage = !!f.mimeType?.startsWith('image/');
        return (
          <li key={f.id}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              title={`${f.mimeType ?? 'ไฟล์'} ${fmtSize(f.sizeBytes)} · ${fmtDateTime(f.createdAt)}${f.source === 'line' ? ' · ส่งผ่านแชท' : ''}`}
              className="group relative block size-20 overflow-hidden rounded-lg border border-line bg-background"
            >
              {isImage && !f.legacy ? (
                // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวที่ server สร้างใหม่ทุกครั้ง
                <img src={href} alt={`ไฟล์ที่ ${i + 1}`} loading="lazy" className="size-full object-cover" />
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center text-[11px] text-muted">
                  <Icon name="file" className="size-6" />
                  {f.legacy ? 'Drive (เดิม)' : f.mimeType === 'application/pdf' ? 'PDF' : 'ไฟล์'}
                </span>
              )}
              <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white group-hover:flex">
                <Icon name="external" className="size-5" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewControls({
  current,
  onReview,
}: {
  current: string;
  onReview: (status: 'approved' | 'rejected', reason: string) => Promise<string | null>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !reason.trim()) return setError('กรุณาระบุเหตุผล');
    setBusy(true);
    setError(null);
    const err = await onReview(status, reason.trim());
    setBusy(false);
    if (err) setError(err);
    else {
      setRejecting(false);
      setReason('');
    }
  };

  if (rejecting) {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm font-medium">เหตุผลที่ไม่ผ่าน (ผู้สมัครจะเห็นข้อความนี้)</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason((cur) => (cur ? `${cur} ${r}` : r))}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs hover:bg-surface"
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          aria-label="เหตุผลที่ไม่ผ่าน"
          className="w-full rounded-lg border border-line bg-background p-2 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-danger/20"
        />
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run('rejected')}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'กำลังบันทึก...' : 'ยืนยันไม่ผ่าน'}
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface">
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || current === 'approved'}
          onClick={() => run('approved')}
          className="rounded-lg border border-brand px-4 py-1.5 text-sm font-semibold text-brand-strong hover:bg-brand-tint disabled:border-line disabled:text-muted disabled:hover:bg-transparent"
        >
          {current === 'approved' ? 'ผ่านแล้ว' : busy ? 'กำลังบันทึก...' : 'ผ่าน'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRejecting(true)}
          className="rounded-lg border border-line px-4 py-1.5 text-sm font-semibold text-danger hover:bg-danger-tint"
        >
          ไม่ผ่าน
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FeedbackCard({
  initial,
  lineLinked,
  onSave,
}: {
  initial: string;
  lineLinked: boolean;
  onSave: DetailActions['feedback'];
}) {
  const [text, setText] = useState(initial);
  const [sendLine, setSendLine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = text.trim() !== initial.trim();

  return (
    <Card title="ข้อความถึงผู้สมัคร">
      <p className="text-sm text-muted">แสดงบนหน้าส่งเอกสารของผู้สมัคร (ล้างอัตโนมัติเมื่อเอกสารอนุมัติครบ)</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={3}
        maxLength={1000}
        aria-label="ข้อความถึงผู้สมัคร"
        className="w-full rounded-lg border border-line bg-background p-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {lineLinked && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={sendLine} onChange={(e) => setSendLine(e.target.checked)} className="size-4 accent-brand" />
          ส่งข้อความนี้ทาง LINE ด้วย
        </label>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || (!dirty && !sendLine)}
          onClick={async () => {
            setBusy(true);
            const err = await onSave(text, sendLine);
            setBusy(false);
            setError(err);
            if (!err) {
              setSaved(true);
              setSendLine(false);
            }
          }}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-40"
        >
          {busy ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        {saved && <span className="text-sm text-brand">บันทึกแล้ว</span>}
      </div>
    </Card>
  );
}

function UnlinkCard({ onUnlink }: { onUnlink: DetailActions['unlinkLine'] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="ผู้สมัครเปลี่ยนบัญชี LINE">
      <p className="text-sm text-muted">
        ยกเลิกการผูก LINE เดิม แล้วให้ผู้สมัครเปิดหน้าลงทะเบียนจาก LINE ใหม่และกรอกเบอร์โทรเดิม ระบบจะผูกบัญชีใหม่ให้
        เอกสารที่ส่งไว้ยังอยู่ครบ แต่ลิงก์ส่วนตัวเดิมจะใช้ไม่ได้อีก
      </p>
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm('ยกเลิกการผูก LINE ของผู้สมัครนี้? บัญชี LINE เดิมจะเข้าถึงข้อมูลนี้ไม่ได้อีก')) return;
          setBusy(true);
          setError(await onUnlink());
          setBusy(false);
        }}
        className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-tint disabled:opacity-60"
      >
        {busy ? 'กำลังดำเนินการ...' : 'ยกเลิกการผูก LINE'}
      </button>
    </Card>
  );
}
