'use client';

import { useEffect, useRef, useState } from 'react';
import { PDPA_SECTIONS } from '@/lib/apply/pdpa';
import { Button, ErrorText, Icon, StatusPanel } from './ui';

// ---------------------------------------------------------------------------
// นโยบาย PDPA

function PdpaContent() {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {PDPA_SECTIONS.map((s) => (
        <section key={s.title}>
          <h3 className="font-semibold">{s.title}</h3>
          {s.paragraphs?.map((p) => (
            <p key={p} className="text-muted">
              {p}
            </p>
          ))}
          {s.items && (
            <ul className="ml-5 list-disc text-muted">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function PdpaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="pdpa-title"
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md rounded-2xl bg-background p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <h2 id="pdpa-title" className="border-b border-line px-5 py-4 text-base font-bold">
          นโยบายความเป็นส่วนตัว (PDPA)
        </h2>
        <div className="overflow-y-auto px-5 py-4">
          <PdpaContent />
        </div>
        <div className="border-t border-line p-4">
          <Button onClick={onClose}>ปิด</Button>
        </div>
      </div>
    </dialog>
  );
}

function ConsentCheckbox({
  checked,
  onChange,
  onOpenPolicy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  onOpenPolicy?: () => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-brand"
      />
      <span>
        ข้าพเจ้าได้อ่านและยินยอมให้บริษัทเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้า
        เพื่อวัตถุประสงค์ในการสรรหาและจ้างงาน ตาม
        {onOpenPolicy ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onOpenPolicy();
            }}
            className="mx-1 font-semibold text-brand underline underline-offset-2"
          >
            นโยบายความเป็นส่วนตัว (PDPA)
          </button>
        ) : (
          ' นโยบายความเป็นส่วนตัว (PDPA) ข้างต้น'
        )}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// ลงทะเบียน

export interface RegisterInput {
  name: string;
  phone: string;
}

export function RegisterScreen({
  initialName,
  initialPhone,
  onSubmit,
}: {
  initialName: string;
  initialPhone: string;
  onSubmit: (input: RegisterInput) => Promise<string | null>;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [consent, setConsent] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    if (!n || !phone) return setError('กรุณากรอกชื่อและเบอร์โทรศัพท์ให้ครบถ้วน');
    if (!/^0\d{9}$/.test(phone)) return setError('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก และต้องขึ้นต้นด้วย 0');
    if (!consent) return setError('กรุณายินยอมนโยบายความเป็นส่วนตัว (PDPA) ก่อนดำเนินการต่อ');
    setBusy(true);
    const err = await onSubmit({ name: n, phone });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="space-y-5 pt-2" noValidate>
      <div>
        <h1 className="text-xl font-bold">ลงทะเบียนส่งเอกสาร</h1>
        <p className="mt-1 text-[15px] text-muted">กรอกข้อมูลเพื่อผูกบัญชีและเริ่มส่งเอกสารสมัครงาน</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reg-name" className="text-sm font-semibold">
          ชื่อ-นามสกุล
        </label>
        <input
          id="reg-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="เช่น สมชาย ใจดี"
          className="h-12 w-full rounded-xl border border-line bg-background px-4 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reg-phone" className="text-sm font-semibold">
          เบอร์โทรศัพท์
        </label>
        <input
          id="reg-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="08xxxxxxxx"
          className="h-12 w-full rounded-xl border border-line bg-background px-4 text-base tracking-wide outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <ConsentCheckbox checked={consent} onChange={setConsent} onOpenPolicy={() => setPolicyOpen(true)} />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} disabled={!consent}>
        ยืนยันและดำเนินการต่อ
      </Button>

      <p className="border-t border-line pt-4 text-center text-sm text-muted">
        เปลี่ยนบัญชี LINE หรือเข้า LINE เดิมไม่ได้? กรุณาติดต่อเจ้าหน้าที่ HR เพื่อย้ายบัญชีให้
      </p>
      <PdpaDialog open={policyOpen} onClose={() => setPolicyOpen(false)} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// ขอความยินยอม PDPA (ผู้สมัครเดิมที่ยังไม่เคยยินยอม หรือนโยบายเปลี่ยนเวอร์ชัน)

export function PdpaScreen({ onAccept }: { onAccept: () => Promise<string | null> }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <StatusPanel icon="alert" tone="warn" title="ยังไม่ได้ให้ความยินยอม">
        <p>ไม่สามารถส่งเอกสารผ่านระบบนี้ได้หากไม่ให้ความยินยอมข้อมูลส่วนบุคคล</p>
        <Button variant="secondary" onClick={() => setDeclined(false)}>
          อ่านนโยบายอีกครั้ง
        </Button>
      </StatusPanel>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h1 className="text-xl font-bold">ขอความยินยอมข้อมูลส่วนบุคคล</h1>
        <p className="mt-1 text-[15px] text-muted">ก่อนส่งเอกสารต่อ กรุณาอ่านและยินยอมนโยบายความเป็นส่วนตัวของบริษัท</p>
      </div>
      <div className="rounded-xl border border-line p-4">
        <PdpaContent />
      </div>
      <ConsentCheckbox checked={consent} onChange={setConsent} />
      <ErrorText>{error}</ErrorText>
      <div className="space-y-2">
        <Button
          busy={busy}
          disabled={!consent}
          onClick={async () => {
            setBusy(true);
            setError(await onAccept());
            setBusy(false);
          }}
        >
          ยินยอมและดำเนินการต่อ
        </Button>
        <Button variant="secondary" onClick={() => setDeclined(true)}>
          ไม่ยินยอม
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// รออนุมัติ

export function PendingScreen({ name, onRefresh }: { name: string; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <StatusPanel icon="hourglass" tone="warn" title="รอเจ้าหน้าที่อนุมัติ">
      <p>
        {name ? `คุณ${name} ` : ''}ลงทะเบียนเรียบร้อยแล้ว เจ้าหน้าที่จะตรวจสอบและอนุมัติก่อน จึงจะแนบเอกสารได้
      </p>
      <p className="flex items-start gap-2 rounded-xl bg-surface p-3 text-left text-sm">
        <Icon name="message" className="mt-0.5 size-4 shrink-0" />
        เมื่ออนุมัติแล้ว ระบบจะส่งข้อความแจ้งในแชท LINE ทันที
      </p>
      <Button
        variant="secondary"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          await onRefresh();
          setBusy(false);
        }}
      >
        เช็คสถานะอีกครั้ง
      </Button>
    </StatusPanel>
  );
}
