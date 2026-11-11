'use client';

/**
 * ช่องค้นหาสาขา — แทน <datalist> ของเบราว์เซอร์ที่ค้นได้แค่ข้อความติดกันเป๊ะ
 * ค้นได้ทีละหลายคำไม่สนลำดับ/เครื่องหมาย เช่น "bangbon samsung", "3285", "lotus ratchaburi"
 */
import { useId, useMemo, useState } from 'react';
import { searchBranches } from '@/lib/admin/onboarding';
import type { BranchOption } from '@/lib/admin/types';

export function BranchPicker({
  value,
  branches,
  onChange,
  className,
  disabled,
}: {
  value: string;
  branches: BranchOption[];
  /** พิมพ์ (branch = null) หรือเลือกจากรายการ (branch = สาขาที่เลือก) */
  onChange: (text: string, branch: BranchOption | null) => void;
  className: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const hits = useMemo(() => (open ? searchBranches(value, branches) : []), [open, value, branches]);

  const pick = (b: BranchOption) => {
    onChange(b.label, b);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || hits.length === 0) return;
          if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, hits.length - 1));
          else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
          else if (e.key === 'Enter') pick(hits[active]);
          else if (e.key === 'Escape') setOpen(false);
          else return;
          e.preventDefault();
        }}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="พิมพ์รหัสหรือชื่อสาขา เช่น 3285 หรือ lotus ratchaburi"
        className={className}
      />
      {open && hits.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-background py-1 text-sm shadow-lg"
        >
          {hits.map((b, i) => (
            <li
              key={b.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(b);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-brand-tint' : ''}`}
            >
              <span className="block">{b.label}</span>
              <span className="block text-xs text-muted">
                {b.company}
                {b.ta && ` · TA ${b.ta}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && value.trim() && hits.length === 0 && (
        <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-line bg-background px-3 py-2 text-sm text-muted shadow-lg">
          ไม่พบสาขาที่ตรงกับ &quot;{value.trim()}&quot;
        </p>
      )}
    </div>
  );
}
