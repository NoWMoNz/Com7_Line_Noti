import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, describe, expect, it } from 'vitest';
import { readXlsxExport } from '../scripts/read-xlsx-export';
import { parseDateOnly } from '../src/lib/migration/transform';

const dir = mkdtempSync(join(tmpdir(), 'xlsx-export-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function writeBook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Applicants');
  a.addRow(['code', 'phone', 'created_at', 'birth_date', 'file', 'total', 'ok']);
  // วันที่บนชีท = เวลาไทย; exceljs เก็บเป็นตัวเลข UTC ตรงตัว
  a.addRow([
    'APP_1',
    '0992760635',
    new Date(Date.UTC(2026, 5, 6, 15, 45, 0)),
    new Date(Date.UTC(1999, 0, 2)),
    { text: 'ใบสมัคร', hyperlink: 'https://drive.google.com/x' },
    { formula: '1+1', result: 2 },
    true,
  ]);
  a.addRow([]);
  const admin = wb.addWorksheet('Login Admin');
  admin.addRow(['email', 'password', 'role', 'remember_token']);
  admin.addRow(['a@b.c', 'hash', 'hr', 'tok']);
  wb.addWorksheet('Other').addRow(['ignored']);
  const file = join(dir, 'book.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

describe('readXlsxExport', () => {
  it('ได้รูปแบบเดียวกับ JSON จาก Apps Script', async () => {
    const exp = await readXlsxExport(await writeBook());

    expect(Object.keys(exp.sheets).sort()).toEqual(['Applicants', 'Login Admin']);
    const [header, row, ...rest] = exp.sheets.Applicants;
    expect(header[0]).toBe('code');
    expect(rest).toEqual([]); // แถวว่างท้ายชีทถูกตัด
    expect(row).toEqual([
      'APP_1',
      '0992760635',
      '2026-06-06T08:45:00.000Z', // 15:45 เวลาไทย
      '1999-01-01T17:00:00.000Z', // เที่ยงคืนไทย
      'ใบสมัคร',
      2,
      true,
    ]);
    expect(parseDateOnly(row[3])).toBe('1999-01-02');

    expect(exp.sheets['Login Admin']).toEqual([
      ['email', 'role'],
      ['a@b.c', 'hr'],
    ]);
  });
});
