'use client';

import { useState } from 'react';
import type { DocItemView, DocsView } from '@/lib/apply/types';
import { Badge, Button, docBadge, Icon, StatusPanel, subitemBadge } from './ui';

/** ปลายทางเมื่อแตะรายการ: เอกสาร (มีหัวข้อย่อย → หน้ารายการย่อย) หรือหัวข้อย่อย */
export type DocTarget = { docKey: string; subitemTitle?: string };

function DocRow({ doc, onOpen }: { doc: DocItemView; onOpen: () => void }) {
  const badge = docBadge(doc.state, doc.subDone, doc.subRequired);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{doc.label}</p>
          {doc.state === 'rejected' && doc.reason ? (
            <p className="mt-0.5 text-sm text-danger">{doc.reason}</p>
          ) : doc.description ? (
            <p className="mt-0.5 line-clamp-1 text-sm text-muted">{doc.description}</p>
          ) : null}
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
      </button>
    </li>
  );
}

function DocList({ title, docs, onOpen }: { title?: string; docs: DocItemView[]; onOpen: (d: DocItemView) => void }) {
  if (docs.length === 0) return null;
  return (
    <section>
      {title && <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>}
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {docs.map((d) => (
          <DocRow key={d.key} doc={d} onOpen={() => onOpen(d)} />
        ))}
      </ul>
    </section>
  );
}

function PersonalLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="link" className="size-4" /> ลิงก์ส่วนตัวของคุณ
      </p>
      <p className="mt-1 text-sm text-muted">ใช้ลิงก์นี้เพื่อกลับมาส่งเอกสารหรือเช็คสถานะได้ทุกเมื่อ (ห้ามส่งต่อให้ผู้อื่น)</p>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          value={link}
          aria-label="ลิงก์ส่วนตัว"
          onFocus={(e) => e.target.select()}
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-background px-3 text-sm"
        />
        <button
          type="button"
          onClick={() =>
            navigator.clipboard
              .writeText(link)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => {})
          }
          className="h-11 shrink-0 rounded-lg bg-foreground px-4 text-sm font-semibold text-background"
        >
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
      </div>
    </div>
  );
}

export function DocsHome({
  name,
  feedback,
  docs,
  personalLink,
  onOpen,
}: {
  name: string;
  feedback: string;
  docs: DocsView;
  personalLink: string | null;
  onOpen: (target: DocTarget) => void;
}) {
  const rejected = docs.required.filter((d) => d.state === 'rejected');
  const pct = docs.total ? Math.round((docs.satisfiedCount / docs.total) * 100) : 0;
  const open = (d: DocItemView) => onOpen({ docKey: d.key });

  return (
    <div className="space-y-5 pt-2">
      <div>
        <p className="text-sm text-muted">สวัสดี</p>
        <h1 className="text-xl font-bold">คุณ{name}</h1>
      </div>

      {feedback && (
        <div role="note" className="rounded-xl border border-danger/30 bg-danger-tint p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <Icon name="message" className="size-4" /> ข้อความจากเจ้าหน้าที่
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[15px]">{feedback}</p>
        </div>
      )}

      {docs.complete ? (
        <StatusPanel icon="check" tone="brand" title="เอกสารอนุมัติครบแล้ว">
          <p>เอกสารทุกรายการได้รับการอนุมัติเรียบร้อยแล้ว ขอบคุณที่ส่งเอกสารครบถ้วน</p>
        </StatusPanel>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">ความคืบหน้า</span>
            <span className="text-muted">
              ส่งแล้ว {docs.satisfiedCount}/{docs.total} รายการ
            </span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-surface"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="ความคืบหน้าการส่งเอกสาร"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          {docs.allSatisfied && rejected.length === 0 && (
            <p className="rounded-xl bg-brand-tint p-3 text-sm text-brand-strong">
              ส่งเอกสารครบแล้ว กำลังรอเจ้าหน้าที่ตรวจสอบ หากต้องแก้ไข ระบบจะแจ้งในแชท LINE
            </p>
          )}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger-tint p-4">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <Icon name="alert" className="size-5" /> มีเอกสารที่ต้องแก้ไข {rejected.length} รายการ
          </p>
          <p className="mt-1 text-sm">เจ้าหน้าที่ตรวจแล้วยังไม่ผ่าน กรุณาแนบไฟล์ใหม่ตามคำแนะนำ</p>
          <Button variant="danger" className="mt-3" onClick={() => open(rejected[0])}>
            แก้ไข {rejected[0].label}
          </Button>
        </div>
      )}

      {docs.allInOne && !docs.complete && (
        <button
          type="button"
          onClick={() => open(docs.allInOne!)}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-brand/50 p-4 text-left hover:bg-brand-tint"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
            <Icon name="layers" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">มีเอกสารทั้งหมดในไฟล์เดียว?</span>
            <span className="block text-sm text-muted">ส่งไฟล์รวมที่นี่แทนการส่งทีละรายการได้</span>
          </span>
          {docs.allInOne.state !== 'missing' && (
            <Badge tone={docBadge(docs.allInOne.state).tone}>{docBadge(docs.allInOne.state).label}</Badge>
          )}
        </button>
      )}

      <DocList title="เอกสารที่ต้องส่ง" docs={docs.required} onOpen={open} />
      <DocList title="เอกสารเพิ่มเติม (ถ้ามี)" docs={docs.optional} onOpen={open} />

      {personalLink && <PersonalLinkBox link={personalLink} />}
    </div>
  );
}

/** เอกสารหลายหน้า: เลือกหัวข้อย่อยที่จะส่ง */
export function DocGroup({ doc, onOpen }: { doc: DocItemView; onOpen: (target: DocTarget) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{doc.label}</h2>
        {doc.description && <p className="mt-1 text-[15px] text-muted">{doc.description}</p>}
        <p className="mt-2 text-sm text-muted">
          ส่งแล้ว {doc.subDone}/{doc.subRequired} หัวข้อ · แตะหัวข้อเพื่อแนบไฟล์
        </p>
      </div>
      {doc.state === 'rejected' && doc.reason && (
        <p className="rounded-xl bg-danger-tint p-3 text-sm text-danger">{doc.reason}</p>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {doc.subitems.map((s) => {
          const b = subitemBadge(s.state);
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => onOpen({ docKey: doc.key, subitemTitle: s.title })}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.title}
                    {s.optional && <span className="ml-1 text-sm font-normal text-muted">(ถ้ามี)</span>}
                  </p>
                  {s.state === 'rejected' && s.reason && <p className="mt-0.5 text-sm text-danger">{s.reason}</p>}
                </div>
                <Badge tone={b.tone}>{b.label}</Badge>
                <Icon name="chevronRight" className="size-5 shrink-0 text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
