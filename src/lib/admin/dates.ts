/**
 * วันเวลาในฟอร์มแอดมิน — ตีความเป็นเวลาไทย (UTC+7 ไม่มี DST) เสมอ ไม่ขึ้นกับเครื่องที่เปิด
 * (ระบบเดิมเขียนข้อความดิบลงชีต แล้ว Sheets เดาเขตเวลาเอง ทำให้กำหนดส่งเพี้ยน — parseDeadlineInput_)
 */
const BKK_OFFSET_MS = 7 * 3600_000;

/** "2026-10-21T10:00" (เวลาไทยจาก <input type="datetime-local">) → ISO UTC | null = ว่าง | undefined = รูปแบบผิด */
export function bangkokLocalToIso(value: string | null | undefined): string | null | undefined {
  const v = (value ?? '').trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v);
  if (!m) return undefined;
  const [, y, mo, d, h = '23', mi = '59'] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi) - BKK_OFFSET_MS;
  const check = new Date(utc + BKK_OFFSET_MS);
  if (check.getUTCMonth() !== +mo - 1 || check.getUTCDate() !== +d) return undefined; // เช่น 31 เม.ย.
  return new Date(utc).toISOString();
}

/** ISO → "2026-10-21T10:00" สำหรับใส่กลับในฟอร์ม */
export function isoToBangkokLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + BKK_OFFSET_MS).toISOString().slice(0, 16);
}
