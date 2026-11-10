'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocItemView, SubitemView } from '@/lib/apply/types';
import { compressImage } from './client-lib';
import { Badge, Button, docBadge, ErrorText, Icon, StatusPanel } from './ui';

const MAX_FILES = 10;
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

interface Picked {
  id: string;
  file: File;
  preview: string | null;
}

export function UploadScreen({
  doc,
  subitem,
  maxUploadMb,
  onUpload,
}: {
  doc: DocItemView;
  subitem: SubitemView | null;
  maxUploadMb: number;
  /** คืนข้อความผิดพลาด หรือ null เมื่อสำเร็จ */
  onUpload: (files: File[], onProgress: (f: number) => void) => Promise<string | null>;
}) {
  const title = subitem?.title ?? doc.label;
  const state = subitem ? subitem.state : doc.state;
  const reason = subitem ? subitem.reason : doc.reason;
  const single = !!subitem;

  const [picked, setPicked] = useState<Picked[]>([]);
  const [replacing, setReplacing] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'uploading'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // คืนหน่วยความจำของรูปตัวอย่างเมื่อออกจากหน้า
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  useEffect(() => () => pickedRef.current.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), []);

  const hasPdf = picked.some((p) => isPdf(p.file));
  const canAddMore = !hasPdf && !(single && picked.length >= 1) && picked.length < MAX_FILES;
  const busy = phase !== 'idle';

  const statusNote = useMemo(() => {
    if (state === 'approved') return null;
    if (state === 'submitted' || state === 'covered' || state === 'partial') return docBadge(state, doc.subDone, doc.subRequired);
    return null;
  }, [state, doc.subDone, doc.subRequired]);

  function addFiles(list: FileList | null) {
    setError(null);
    const incoming = Array.from(list ?? []);
    if (incoming.length === 0) return;

    const pdfs = incoming.filter(isPdf);
    if (pdfs.length > 0 && (incoming.length > 1 || picked.length > 0)) {
      if (picked.length > 0 && !window.confirm('ไฟล์ PDF แนบได้ทีละไฟล์ — ไฟล์ที่เลือกไว้ก่อนหน้าจะถูกเอาออก ต้องการดำเนินการต่อหรือไม่?')) {
        return;
      }
      replaceWith([pdfs[0]]);
      if (incoming.length > 1) setError('ไฟล์ PDF แนบได้ทีละไฟล์ ระบบเลือกไฟล์ PDF แรกให้');
      return;
    }
    const room = single ? 1 - picked.length : MAX_FILES - picked.length;
    if (incoming.length > room) setError(single ? 'หัวข้อนี้แนบได้ 1 ไฟล์' : `แนบได้สูงสุด ${MAX_FILES} ไฟล์`);
    const next = incoming.slice(0, Math.max(0, room)).map(toPicked);
    setPicked((cur) => [...cur, ...next]);
  }

  function replaceWith(files: File[]) {
    picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    setPicked(files.map(toPicked));
  }

  function remove(id: string) {
    setPicked((cur) => {
      const p = cur.find((x) => x.id === id);
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return cur.filter((x) => x.id !== id);
    });
  }

  async function submit() {
    if (picked.length === 0) return;
    setError(null);
    setPhase('preparing');
    const files: File[] = [];
    for (const p of picked) {
      const f = isPdf(p.file) ? p.file : await compressImage(p.file);
      if (f.size > maxUploadMb * 1024 * 1024) {
        setPhase('idle');
        setError(
          isPdf(f)
            ? `ไฟล์ PDF มีขนาดเกิน ${maxUploadMb} MB กรุณาลดขนาดไฟล์ หรือถ่ายเป็นรูปแทน`
            : `รูปมีขนาดเกิน ${maxUploadMb} MB กรุณาเลือกรูปอื่น`,
        );
        return;
      }
      files.push(f);
    }
    setPhase('uploading');
    setProgress(0);
    const err = await onUpload(files, setProgress);
    setPhase('idle');
    if (err) setError(err);
  }

  // ---------- อนุมัติแล้ว → ปิดการแนบไฟล์ ----------
  if (state === 'approved') {
    return (
      <StatusPanel icon="check" tone="brand" title={title}>
        <p>เอกสารนี้ได้รับการอนุมัติแล้ว ไม่สามารถแนบไฟล์ใหม่ได้ หากต้องการแก้ไข กรุณาติดต่อเจ้าหน้าที่</p>
      </StatusPanel>
    );
  }

  // ---------- ส่งแล้ว รอตรวจ → แสดงสถานะก่อน ส่งใหม่ได้ถ้ากดยืนยัน ----------
  if (statusNote && !replacing) {
    return (
      <div className="space-y-4">
        <StatusPanel icon="check" tone="info" title={title}>
          <p>
            {state === 'covered'
              ? 'เอกสารนี้อยู่ในไฟล์รวมที่ส่งไว้แล้ว ไม่ต้องส่งแยกอีก'
              : state === 'partial'
                ? 'ส่งไฟล์บางส่วนแล้ว'
                : 'ส่งไฟล์แล้ว กำลังรอเจ้าหน้าที่ตรวจสอบ'}
          </p>
        </StatusPanel>
        <Button variant="secondary" onClick={() => setReplacing(true)}>
          ส่งไฟล์ใหม่แทนไฟล์เดิม
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">
            {title}
            {subitem?.optional && <span className="ml-1 text-sm font-normal text-muted">(ถ้ามี)</span>}
          </h2>
          {state === 'rejected' && <Badge tone="danger">ต้องแก้ไข</Badge>}
        </div>
        {!subitem && doc.description && <p className="mt-1 text-[15px] text-muted">{doc.description}</p>}
      </div>

      {state === 'rejected' && reason && (
        <div className="flex gap-2 rounded-xl bg-danger-tint p-3 text-sm text-danger">
          <Icon name="message" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">เหตุผลที่ต้องแก้ไข: </span>
            {reason}
          </span>
        </div>
      )}
      {replacing && (
        <p className="rounded-xl bg-warn-tint p-3 text-sm text-warn">ไฟล์ที่ส่งใหม่จะแทนที่ไฟล์เดิมของรายการนี้ทั้งหมด</p>
      )}

      {picked.length > 0 && (
        <ul className="grid grid-cols-3 gap-2" aria-label="ไฟล์ที่เลือก">
          {picked.map((p, i) => (
            <li key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-surface">
              {p.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- รูปจากเครื่องผู้ใช้ (blob URL)
                <img src={p.preview} alt={`ไฟล์ที่ ${i + 1}`} className="size-full object-cover" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted">
                  <Icon name="file" className="size-8" />
                  <span className="line-clamp-2 break-all">{p.file.name}</span>
                </div>
              )}
              {!busy && (
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`เอาไฟล์ที่ ${i + 1} ออก`}
                  className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-black/60 text-white"
                >
                  <Icon name="x" className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAddMore && !busy && (
        <div className="grid grid-cols-2 gap-2">
          <PickButton icon="camera" label="ถ่ายรูป" onClick={() => cameraRef.current?.click()} />
          <PickButton
            icon={picked.length ? 'plus' : 'file'}
            label={picked.length ? 'เพิ่มไฟล์' : 'เลือกไฟล์'}
            onClick={() => fileRef.current?.click()}
          />
        </div>
      )}
      <p className="text-sm text-muted">
        {single ? 'แนบได้ 1 ไฟล์' : 'รูปภาพแนบได้หลายรูป หรือ PDF 1 ไฟล์'} · JPG, PNG, PDF · รูปจะถูกย่อขนาดให้อัตโนมัติ
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple={!single}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <ErrorText>{error}</ErrorText>

      {picked.length > 0 && (
        <div className="space-y-2">
          {phase === 'uploading' && (
            <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
              <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          <Button busy={busy} onClick={submit}>
            {phase === 'preparing'
              ? 'กำลังเตรียมไฟล์...'
              : phase === 'uploading'
                ? `กำลังส่ง ${Math.round(progress * 100)}%`
                : `ส่งไฟล์ (${picked.length} ไฟล์)`}
          </Button>
          {busy && <p className="text-center text-sm text-muted">กรุณาอย่าปิดหน้านี้จนกว่าจะส่งเสร็จ</p>}
        </div>
      )}
    </div>
  );
}

let seq = 0;
function toPicked(file: File): Picked {
  seq += 1;
  return { id: `f${seq}`, file, preview: isPdf(file) ? null : URL.createObjectURL(file) };
}

function PickButton({ icon, label, onClick }: { icon: 'camera' | 'file' | 'plus'; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-[15px] font-medium hover:border-brand hover:bg-brand-tint focus-visible:border-brand focus-visible:outline-none"
    >
      <Icon name={icon} className="size-7 text-brand" />
      {label}
    </button>
  );
}
