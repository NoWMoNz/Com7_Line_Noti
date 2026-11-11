'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ApplicantDetail, ApplicantInfoInput, ReviewItemInput } from '@/lib/admin/types';
import type { ClosedStatus, DocScope } from '@/lib/docs/types';
import { Badge, Button, ErrorText, Icon } from '@/components/ui';
import { DOC_SCOPE_LABEL, fmtDateTime, STAGE } from './admin-lib';
import { DeleteCard, InfoCard } from './applicant-info';
import { DocsReview } from './doc-review';

export interface DetailActions {
  /** คืนข้อความผิดพลาด หรือ null */
  review: (items: ReviewItemInput[], notify: boolean) => Promise<string | null>;
  /** docScope = ชุดเอกสารที่ให้ส่ง (ตั้งพร้อมอนุมัติ) */
  approve: (approved: boolean, notify: boolean, docScope?: DocScope) => Promise<string | null>;
  setDocScope: (scope: DocScope, notify: boolean) => Promise<string | null>;
  /** null = คืนสถานะ */
  setClosed: (status: ClosedStatus | null, reason: string) => Promise<string | null>;
  feedback: (text: string, sendLine: boolean) => Promise<string | null>;
  unlinkLine: () => Promise<string | null>;
  saveInfo: (input: ApplicantInfoInput) => Promise<string | null>;
  remove: (confirmCode: string) => Promise<string | null>;
  /** มี = มีสิทธิ์ส่งเตือนเอกสารค้าง */
  remind?: () => Promise<string | null>;
}

export function ApplicantDetailPanel({
  detail,
  actions,
  onDirtyChange,
}: {
  detail: ApplicantDetail;
  actions: DetailActions;
  /** มีผลตรวจที่ยังไม่บันทึก */
  onDirtyChange: (dirty: boolean) => void;
}) {
  const stage = STAGE[detail.stage];

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

      {detail.closed && <ClosedBanner closed={detail.closed} onRestore={() => actions.setClosed(null, '')} />}
      <ApprovalCard detail={detail} onApprove={actions.approve} />
      {detail.approved && !detail.onboardNotified && <DocScopeCard key={detail.docScope} detail={detail} onChange={actions.setDocScope} />}
      <InfoCard detail={detail} onSave={actions.saveInfo} />

      {detail.approved && (
        <div className="space-y-3">
          {actions.remind &&
            detail.lineLinked &&
            !detail.onboardNotified &&
            !detail.closed &&
            detail.stage !== 'complete' &&
            detail.stage !== 'initial_complete' && <RemindButton onRemind={actions.remind} />}
          {detail.stage === 'initial_complete' && (
            <p className="rounded-lg bg-brand-tint p-3 text-sm text-brand-strong">
              อนุมัติเอกสารเบื้องต้นครบแล้ว — ถ้าผ่านขั้นตอนนี้ ให้เปลี่ยนเป็น &quot;{DOC_SCOPE_LABEL.all}&quot; ด้านบน หรือปิดใบสมัคร (Cancel / Turndown) ด้านล่าง
            </p>
          )}
          {detail.onboardNotified && (
            <p className="rounded-lg bg-brand-tint p-3 text-sm text-brand-strong">
              แจ้งเริ่มงานแล้ว — ผู้สมัครเห็นว่าเอกสารอนุมัติครบ ·{' '}
              <Link href="/admin/onboarding" className="font-medium underline underline-offset-2">
                ดูที่หน้าแจ้งเริ่มงาน
              </Link>
            </p>
          )}
          {!detail.onboardNotified && detail.stage === 'complete' && (
            <p className="rounded-lg bg-brand-tint p-3 text-sm text-brand-strong">
              อนุมัติเอกสารครบแล้ว — ย้ายไปรอที่หน้าแจ้งเริ่มงาน ·{' '}
              <Link href="/admin/onboarding" className="font-medium underline underline-offset-2">
                ไปแจ้งเริ่มงาน
              </Link>
            </p>
          )}
          <DocsReview detail={detail} onSave={actions.review} onDirtyChange={onDirtyChange} />
        </div>
      )}

      <FeedbackCard key={detail.id} initial={detail.feedback} lineLinked={detail.lineLinked} onSave={actions.feedback} />
      {detail.lineLinked && <UnlinkCard onUnlink={actions.unlinkLine} />}
      {!detail.closed && <CloseCard onClose={actions.setClosed} />}
      <DeleteCard code={detail.code} onDelete={actions.remove} />
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
  const [scope, setScope] = useState<DocScope>(detail.docScope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (approved: boolean) => {
    if (!approved && !window.confirm('ยกเลิกการอนุมัติ? ผู้สมัครจะแนบเอกสารไม่ได้จนกว่าจะอนุมัติอีกครั้ง')) return;
    setBusy(true);
    setError(await onApprove(approved, notify, approved ? scope : undefined));
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
      <ScopeChoice value={scope} onChange={setScope} />
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
// ชุดเอกสาร: ส่งเบื้องต้น / ส่งทั้งหมด

const SCOPE_HINT: Record<DocScope, string> = {
  initial: 'เฉพาะเอกสารที่ตั้งเป็น "เอกสารเบื้องต้น" ในหน้าตั้งค่าเอกสาร',
  all: 'เอกสารทุกรายการที่เปิดใช้งาน',
};

function ScopeChoice({ value, onChange }: { value: DocScope; onChange: (v: DocScope) => void }) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-medium">ชุดเอกสารที่ให้ส่ง</legend>
      {(['initial', 'all'] as const).map((s) => (
        <label
          key={s}
          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
            value === s ? 'border-brand bg-brand-tint' : 'border-line hover:bg-surface'
          }`}
        >
          <input type="radio" name="doc-scope" checked={value === s} onChange={() => onChange(s)} className="mt-0.5 size-4 accent-brand" />
          <span>
            <span className="block font-medium">{DOC_SCOPE_LABEL[s]}</span>
            <span className="block text-xs text-muted">{SCOPE_HINT[s]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function DocScopeCard({ detail, onChange }: { detail: ApplicantDetail; onChange: DetailActions['setDocScope'] }) {
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next: DocScope = detail.docScope === 'initial' ? 'all' : 'initial';

  const run = async () => {
    const msg =
      next === 'all'
        ? 'เปลี่ยนเป็น "ส่งทั้งหมด"? ผู้สมัครจะเห็นเอกสารที่เหลือและต้องส่งให้ครบ'
        : 'เปลี่ยนเป็น "ส่งเบื้องต้น"? ผู้สมัครจะเห็นเฉพาะเอกสารเบื้องต้น (ไฟล์ที่ส่งไว้แล้วยังอยู่ครบ)';
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(await onChange(next, notify));
    setBusy(false);
  };

  return (
    <div className="space-y-2 rounded-xl border border-line px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          ชุดเอกสาร: <b>{DOC_SCOPE_LABEL[detail.docScope]}</b>
          <span className="text-muted"> · {SCOPE_HINT[detail.docScope]}</span>
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
            next === 'all' ? 'bg-brand text-white hover:bg-brand-strong' : 'text-muted underline underline-offset-2 hover:text-foreground'
          }`}
        >
          {busy ? 'กำลังเปลี่ยน...' : `เปลี่ยนเป็น${DOC_SCOPE_LABEL[next]}`}
        </button>
      </div>
      {next === 'all' && detail.lineLinked && !detail.closed && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-brand" />
          ส่ง LINE แจ้งผู้สมัครให้แนบเอกสารที่เหลือ
        </label>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ปิดใบสมัคร: Cancel / Turndown

const CLOSED_TEXT: Record<ClosedStatus, { label: string; hint: string }> = {
  cancel: { label: 'Cancel', hint: 'ยกเลิกใบสมัคร (เช่น ไม่ผ่านคุณสมบัติ / ติดต่อไม่ได้)' },
  turndown: { label: 'Turndown', hint: 'ผู้สมัครปฏิเสธข้อเสนอ / ไม่มาเริ่มงาน' },
};

function ClosedBanner({ closed, onRestore }: { closed: NonNullable<ApplicantDetail['closed']>; onRestore: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm">
          <Badge tone="muted">{CLOSED_TEXT[closed.status].label}</Badge>
          <span>
            ปิดใบสมัครแล้ว{closed.by && ` โดย ${closed.by}`}
            {closed.at && ` · ${fmtDateTime(closed.at)}`}
          </span>
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm('คืนสถานะใบสมัคร? ผู้สมัครจะกลับไปอยู่ในรายชื่อปกติ')) return;
            setBusy(true);
            setError(await onRestore());
            setBusy(false);
          }}
          className="text-sm font-semibold text-brand underline underline-offset-2 disabled:text-muted"
        >
          {busy ? 'กำลังคืนสถานะ...' : 'คืนสถานะ'}
        </button>
      </div>
      {closed.reason && <p className="text-sm text-muted">เหตุผล: {closed.reason}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function CloseCard({ onClose }: { onClose: DetailActions['setClosed'] }) {
  const [status, setStatus] = useState<ClosedStatus>('cancel');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="ปิดใบสมัคร (Cancel / Turndown)">
      <p className="text-sm text-muted">
        ย้ายไปแท็บ Cancel/Turndown — ไม่ถูกเตือนเอกสาร ไม่ขึ้นหน้าแจ้งเริ่มงาน ข้อมูลและไฟล์ยังอยู่ครบ คืนสถานะได้ภายหลัง
      </p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="สถานะที่ปิด">
        {(['cancel', 'turndown'] as const).map((s) => (
          <label
            key={s}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
              status === s ? 'border-foreground bg-surface' : 'border-line hover:bg-surface'
            }`}
          >
            <input type="radio" name="closed-status" checked={status === s} onChange={() => setStatus(s)} className="mt-0.5 size-4 accent-brand" />
            <span>
              <span className="block font-medium">{CLOSED_TEXT[s].label}</span>
              <span className="block text-xs text-muted">{CLOSED_TEXT[s].hint}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">เหตุผล (ไม่บังคับ)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          className="h-10 w-full rounded-lg border border-line bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`ปิดใบสมัครเป็น ${CLOSED_TEXT[status].label}?`)) return;
          setBusy(true);
          setError(await onClose(status, reason));
          setBusy(false);
        }}
        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-60"
      >
        {busy ? 'กำลังบันทึก...' : `ปิดใบสมัครเป็น ${CLOSED_TEXT[status].label}`}
      </button>
    </Card>
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

function RemindButton({ onRemind }: { onRemind: () => Promise<string | null> }) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
      <span className="text-muted">ผู้สมัครยังส่งไม่ครบ?</span>
      <button
        type="button"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true, msg: null, ok: false });
          const err = await onRemind();
          setState({ busy: false, msg: err ?? 'ส่งเตือนทาง LINE แล้ว', ok: !err });
        }}
        className="font-semibold text-brand underline underline-offset-2 disabled:text-muted"
      >
        {state.busy ? 'กำลังส่ง...' : 'ส่ง LINE เตือนรายการที่ยังขาด'}
      </button>
      {state.msg && <span className={state.ok ? 'text-brand' : 'text-danger'}>{state.msg}</span>}
    </div>
  );
}
