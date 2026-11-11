/**
 * อ่านไฟล์ .xlsx ที่ดาวน์โหลดจาก Google Sheets (File → Download → Microsoft Excel)
 * ให้ออกมาเป็นรูปแบบเดียวกับ JSON จาก scripts/gas/ExportForMigration.gs
 *
 * - ค่าในช่อง = ค่าที่แสดง (เหมือน getValues ของ Apps Script): สูตรใช้ผลลัพธ์, ลิงก์ใช้ข้อความ
 * - วันที่ใน .xlsx ไม่มีโซนเวลา → ถือเป็นเวลาไทย (โซนเวลาของชีทเดิม)
 * - ตัดคอลัมน์ password / remember_token / remember_expiry ของแอดมินทิ้ง
 */
import ExcelJS from 'exceljs';
import type { SheetExport } from '../src/lib/migration/transform';

export const EXPORT_SHEETS = [
  'Applicants', 'DocConfig', 'Config', 'Database', 'Login Admin',
  'Notification_Log', 'Audit_Log', 'Database_Logs',
];
const ADMIN_SECRET_COLUMNS = ['password', 'remember_token', 'remember_expiry'];

/** exceljs คืนวันที่เป็น Date ที่ตัวเลขแบบ UTC = เวลาบนชีท → เขียนกลับเป็นเวลาไทย */
function sheetDateToIso(d: Date): string {
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const local =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00`;
  return new Date(local).toISOString();
}

export function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return sheetDateToIso(v);
  if (typeof v !== 'object') return v;
  if ('richText' in v) return v.richText.map((r) => r.text).join('');
  if ('error' in v) return '';
  if ('formula' in v || 'sharedFormula' in v) return cellValue((v as ExcelJS.CellFormulaValue).result ?? '');
  if ('text' in v) return cellValue((v as ExcelJS.CellHyperlinkValue).text as ExcelJS.CellValue);
  return String(v);
}

function sheetRows(ws: ExcelJS.Worksheet): unknown[][] {
  const width = ws.actualColumnCount ? ws.columnCount : 0;
  const rows: unknown[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const out: unknown[] = [];
    for (let c = 1; c <= width; c++) out.push(cellValue(row.getCell(c).value));
    rows.push(out);
  }
  // ตัดแถวว่างท้ายชีท (getDataRange ของ Apps Script ก็ไม่รวม)
  while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return rows;
}

function dropAdminSecrets(rows: unknown[][]): unknown[][] {
  if (!rows.length) return rows;
  const header = rows[0].map((h) => String(h).trim());
  const drop = new Set(ADMIN_SECRET_COLUMNS.map((h) => header.indexOf(h)).filter((i) => i !== -1));
  return rows.map((row) => row.filter((_, i) => !drop.has(i)));
}

export async function readXlsxExport(file: string): Promise<SheetExport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets: Record<string, unknown[][]> = {};
  for (const name of EXPORT_SHEETS) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;
    const rows = sheetRows(ws);
    sheets[name] = name === 'Login Admin' ? dropAdminSecrets(rows) : rows;
  }
  return { exportedAt: new Date().toISOString(), sheets };
}
