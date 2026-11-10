import { describe, expect, it } from 'vitest';
import { bangkokLocalToIso, isoToBangkokLocal } from '@/lib/admin/dates';

describe('กำหนดส่ง (เวลาไทย)', () => {
  it('ฟอร์ม → UTC และกลับมาเหมือนเดิม ไม่ขึ้นกับเขตเวลาเครื่อง', () => {
    expect(bangkokLocalToIso('2026-10-21T10:00')).toBe('2026-10-21T03:00:00.000Z');
    expect(isoToBangkokLocal('2026-10-21T03:00:00.000Z')).toBe('2026-10-21T10:00');
    expect(bangkokLocalToIso('2026-01-01T03:30')).toBe('2025-12-31T20:30:00.000Z');
  });
  it('ใส่แต่วันที่ → สิ้นวัน 23:59 / ว่าง → null / ผิดรูป → undefined', () => {
    expect(bangkokLocalToIso('2026-10-21')).toBe('2026-10-21T16:59:00.000Z');
    expect(bangkokLocalToIso('')).toBeNull();
    expect(bangkokLocalToIso('21/10/2026')).toBeUndefined();
    expect(bangkokLocalToIso('2026-04-31T10:00')).toBeUndefined();
    expect(isoToBangkokLocal(null)).toBe('');
  });
});
