/**
 * รัน migration + seed จริงบน PostgreSQL ในหน่วยความจำ (PGlite) เพื่อยืนยันว่า SQL ถูกต้อง
 * schema auth / storage ของ Supabase จำลองไว้แค่ส่วนที่ migration อ้างถึง
 */
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_STUBS = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  // รันทุกไฟล์ใน migrations ตามลำดับชื่อ เหมือนที่ Supabase ทำ
  for (const f of readdirSync('supabase/migrations').filter((n) => n.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  }
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
});

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

describe('schema', () => {
  it('seed: เอกสาร 14 ชนิด (2 ไม่บังคับ), ไฟล์รวม 1 ชนิด, bucket private', async () => {
    expect(await one<{ n: number }>('select count(*)::int n from doc_types')).toEqual({ n: 14 });
    expect(await one<{ key: string }>('select key from doc_types where covers_all')).toEqual({ key: 'doc0_all_in_one' });
    expect(await one<{ public: boolean }>(`select public from storage.buckets where id = 'applicant-docs'`)).toEqual({ public: false });
  });

  it('ผู้สมัครใหม่ได้ code + access_token สุ่มอัตโนมัติ', async () => {
    const a = await one<{ code: string; access_token: string }>(
      `insert into applicants (line_user_id) values ('U1') returning code, access_token`,
    );
    expect(a.code).toMatch(/^APP_[0-9a-f]{10}$/);
    expect(a.access_token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('line_user_id ซ้ำไม่ได้', async () => {
    await expect(db.query(`insert into applicants (line_user_id) values ('U1')`)).rejects.toThrow();
  });

  it('ไฟล์ต้องมี storage_path หรือ legacy_url อย่างใดอย่างหนึ่ง', async () => {
    const { id } = await one<{ id: string }>(`select id from applicants where line_user_id = 'U1'`);
    await expect(
      db.query(`insert into applicant_files (applicant_id, doc_key) values ($1, 'doc9_health_receipt')`, [id]),
    ).rejects.toThrow();
    await db.query(
      `insert into applicant_files (applicant_id, doc_key, legacy_url, source) values ($1, 'doc9_health_receipt', 'https://x', 'legacy')`,
      [id],
    );
  });

  it('ผลตรวจ: สถานะต้องถูกต้อง และ 1 ช่อง = 1 แถว', async () => {
    const { id } = await one<{ id: string }>(`select id from applicants where line_user_id = 'U1'`);
    await expect(
      db.query(`insert into doc_reviews (applicant_id, doc_key, status) values ($1, 'doc9_health_receipt', 'ok')`, [id]),
    ).rejects.toThrow();
    const upsert = `insert into doc_reviews (applicant_id, doc_key, subitem_title, status) values ($1, 'doc1_application_set', 'ใบสมัครหน้าที่ 1', $2)
                    on conflict (applicant_id, doc_key, subitem_title) do update set status = excluded.status`;
    await db.query(upsert, [id, 'pending_review']);
    await db.query(upsert, [id, 'approved']);
    const rows = (await db.query(`select status from doc_reviews where applicant_id = $1`, [id])).rows;
    expect(rows).toEqual([{ status: 'approved' }]);
  });

  it('สาขา: label สร้างจากรหัส + ชื่อ', async () => {
    const b = await one<{ label: string }>(`insert into branches (shop_code, shop_name) values ('1001', 'สยาม') returning label`);
    expect(b.label).toBe('1001 - สยาม');
    const b2 = await one<{ label: string }>(`insert into branches (shop_name) values ('ไม่มีรหัส') returning label`);
    expect(b2.label).toBe('ไม่มีรหัส');
  });

  it('ลบผู้สมัคร → ไฟล์และผลตรวจถูกลบตาม, log ยังอยู่', async () => {
    const { id } = await one<{ id: string }>(`select id from applicants where line_user_id = 'U1'`);
    await db.query(`insert into notification_log (type, applicant_id) values ('test', $1)`, [id]);
    await db.query(`delete from applicants where id = $1`, [id]);
    expect(await one(`select count(*)::int n from applicant_files`)).toEqual({ n: 0 });
    expect(await one(`select count(*)::int n from doc_reviews`)).toEqual({ n: 0 });
    expect(await one(`select applicant_id from notification_log where type = 'test'`)).toEqual({ applicant_id: null });
  });

  it('หัวข้อตรวจของ HR: ไม่ใช่ช่องอัปโหลด / ไฟล์เดิมย้ายไปช่องหลัก / เหตุผลตีกลับย้ายไปที่เอกสาร', async () => {
    const kinds = await db.query<{ title: string; kind: string }>(
      `select title, kind from doc_subitems where doc_key = 'doc3_id_card' order by sort_order`,
    );
    expect(kinds.rows).toEqual([
      { title: 'เซ็นรับรอง', kind: 'check' },
      { title: 'วันหมดอายุบัตร', kind: 'check' },
    ]);
    expect((await one<{ kind: string }>(`select kind from doc_subitems where doc_key = 'doc1_application_set' limit 1`))?.kind).toBe('file');

    // ข้อมูลแบบระบบเดิม: ไฟล์และผลตรวจผูกกับหัวข้อตรวจ
    const a = await one<{ id: string }>(`insert into applicants (name) values ('เดิม') returning id`);
    await db.query(`insert into applicant_files (applicant_id, doc_key, subitem_title, legacy_url) values ($1, 'doc3_id_card', 'เซ็นรับรอง', 'https://x')`, [a!.id]);
    await db.query(
      `insert into doc_reviews (applicant_id, doc_key, subitem_title, status, reason) values ($1, 'doc3_id_card', 'วันหมดอายุบัตร', 'rejected', 'บัตรหมดอายุ')`,
      [a!.id],
    );
    await db.query(`select convert_check_subitems()`);

    expect((await one<{ subitem_title: string }>(`select subitem_title from applicant_files where applicant_id = $1`, [a!.id]))?.subitem_title).toBe('');
    const rv = await db.query<{ subitem_title: string; status: string; reason: string }>(
      `select subitem_title, status, reason from doc_reviews where applicant_id = $1`,
      [a!.id],
    );
    expect(rv.rows).toEqual([{ subitem_title: '', status: 'rejected', reason: 'วันหมดอายุบัตร: บัตรหมดอายุ' }]);
  });

  it('เปิด RLS ครบทุกตาราง', async () => {
    const rows = (await db.query<{ relname: string }>(
      `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`,
    )).rows;
    expect(rows).toEqual([]);
  });
});
