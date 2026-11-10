'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { DocState, SubitemState } from '@/lib/docs/status';

// ---------------------------------------------------------------------------
// ปุ่ม

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong disabled:bg-line disabled:text-muted',
  secondary: 'border border-line bg-background text-foreground hover:bg-surface disabled:text-muted',
  danger: 'bg-danger text-white hover:opacity-90 disabled:bg-line disabled:text-muted',
};

export function Button({
  variant = 'primary',
  className = '',
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed ${BUTTON[variant]} ${className}`}
    >
      {busy && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// ป้ายสถานะ

type Tone = 'brand' | 'info' | 'warn' | 'danger' | 'muted';

const TONE: Record<Tone, string> = {
  brand: 'bg-brand-tint text-brand-strong',
  info: 'bg-info-tint text-info',
  warn: 'bg-warn-tint text-warn',
  danger: 'bg-danger-tint text-danger',
  muted: 'bg-surface text-muted',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function docBadge(state: DocState, subDone = 0, subRequired = 0): { tone: Tone; label: string } {
  switch (state) {
    case 'approved':
      return { tone: 'brand', label: 'อนุมัติแล้ว' };
    case 'submitted':
      return { tone: 'info', label: 'รอตรวจ' };
    case 'covered':
      return { tone: 'info', label: 'อยู่ในไฟล์รวม' };
    case 'rejected':
      return { tone: 'danger', label: 'ต้องแก้ไข' };
    case 'partial':
      return { tone: 'warn', label: `ส่งแล้ว ${subDone}/${subRequired}` };
    default:
      return { tone: 'muted', label: 'ยังไม่ส่ง' };
  }
}

export function subitemBadge(state: SubitemState): { tone: Tone; label: string } {
  return docBadge(state);
}

// ---------------------------------------------------------------------------
// ไอคอน (SVG ในตัว ไม่พึ่ง CDN)

const ICONS = {
  check: <path d="M20 6 9 17l-5-5" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  hourglass: <path d="M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2" />,
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 10 5-10 5L2 7l10-5Z" />
      <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  external: <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// โครงหน้า

export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-1 border-b border-line bg-background/95 px-2 py-2 backdrop-blur">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="ย้อนกลับ"
          className="grid size-11 place-items-center rounded-full text-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Icon name="chevronLeft" className="size-6" />
        </button>
      )}
      <h1 className={`truncate text-base font-semibold ${onBack ? '' : 'px-2'}`}>{title}</h1>
    </div>
  );
}

/** หน้าจอแจ้งสถานะกลางจอ (รออนุมัติ / ผิดพลาด / ครบแล้ว) */
export function StatusPanel({
  icon,
  tone,
  title,
  children,
}: {
  icon: IconName;
  tone: Tone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-2 py-10 text-center">
      <div className={`mb-5 grid size-16 place-items-center rounded-full ${TONE[tone]}`}>
        <Icon name={icon} className="size-8" />
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-2 w-full space-y-4 text-[15px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}
