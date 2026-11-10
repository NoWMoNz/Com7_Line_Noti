/**
 * ย้ายข้อมูลจาก Google Sheets (ไฟล์ JSON จาก ExportForMigration.gs) เข้า Supabase
 *
 *   npm run migrate -- <ไฟล์.json> --dry-run   # ดูจำนวนแถว + คำเตือน ไม่เขียนอะไร
 *   npm run migrate -- <ไฟล์.json>             # เขียนจริง
 *
 * รันซ้ำได้ (idempotent): ผู้สมัคร upsert ตาม code, ไฟล์/log ที่มาจากระบบเดิมถูกลบแล้วใส่ใหม่
 * ⚠️ ข้อมูลสาขา (branches) ถูกแทนที่ทั้งหมดด้วยข้อมูลจากชีท — ใช้ก่อนเปิดระบบใหม่เท่านั้น
 *
 * ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local
 */
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildMigrationPlan, type MigrationPlan, type SheetExport } from '../src/lib/migration/transform';

const BATCH = 500;

function chunk<T>(arr: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

function printPlan(plan: MigrationPlan) {
  console.table({
    doc_types: plan.docTypes.length,
    doc_subitems: plan.docSubitems.length,
    branches: plan.branches.length,
    applicants: plan.applicants.length,
    'applicant_files (legacy)': plan.files.length,
    doc_reviews: plan.reviews.length,
    admins: plan.admins.length,
    settings: plan.settings.length,
    notification_log: plan.notifications.length,
    audit_log: plan.audits.length,
  });
  if (plan.warnings.length) {
    console.log(`\nคำเตือน ${plan.warnings.length} รายการ:`);
    plan.warnings.slice(0, 50).forEach((w) => console.log('  - ' + w));
    if (plan.warnings.length > 50) console.log(`  ... และอีก ${plan.warnings.length - 50} รายการ`);
  }
}

async function load(db: SupabaseClient, plan: MigrationPlan) {
  console.log('\n[1/8] doc_types + doc_subitems');
  must(await db.from('doc_types').upsert(plan.docTypes, { onConflict: 'key' }), 'doc_types');
  const keys = plan.docTypes.map((d) => d.key);
  must(await db.from('doc_subitems').delete().in('doc_key', keys), 'clear doc_subitems');
  for (const c of chunk(plan.docSubitems)) must(await db.from('doc_subitems').insert(c), 'doc_subitems');
  // หัวข้อที่เป็นจุดตรวจของ HR (เซ็นรับรอง ฯลฯ) ไม่ใช่ช่องอัปโหลด — ดู migrations/0004_doc_checks.sql
  // (เรียกซ้ำตอนท้ายหลังนำเข้าไฟล์/ผลตรวจด้วย)

  console.log('[2/8] branches (แทนที่ทั้งหมด)');
  must(await db.from('branches').delete().gte('id', 0), 'clear branches');
  for (const c of chunk(plan.branches)) must(await db.from('branches').insert(c), 'branches');
  const branchRows = must(await db.from('branches').select('id, label, shop_name, shop_code'), 'read branches') as Array<{
    id: number;
    label: string;
    shop_name: string;
    shop_code: string | null;
  }>;
  const branchByText = new Map<string, number>();
  for (const b of branchRows) {
    for (const t of [b.label, b.shop_name, b.shop_code]) if (t) branchByText.set(t.trim().toLowerCase(), b.id);
  }

  console.log('[3/8] settings');
  if (plan.settings.length) must(await db.from('settings').upsert(plan.settings, { onConflict: 'key' }), 'settings');

  console.log('[4/8] applicants');
  const idByCode = new Map<string, string>();
  for (const c of chunk(plan.applicants)) {
    const rows = c.map((a) => ({
      ...a,
      branch_id: a.branch_label ? branchByText.get(a.branch_label.trim().toLowerCase()) ?? null : null,
    }));
    const saved = must(await db.from('applicants').upsert(rows, { onConflict: 'code' }).select('id, code'), 'applicants') as Array<{
      id: string;
      code: string;
    }>;
    saved.forEach((s) => idByCode.set(s.code, s.id));
  }
  const appIds = [...idByCode.values()];

  console.log('[5/8] applicant_files (ลิงก์ Google Drive เดิม)');
  for (const c of chunk(appIds, 200)) {
    must(await db.from('applicant_files').delete().eq('source', 'legacy').in('applicant_id', c), 'clear legacy files');
  }
  const fileRows = plan.files.map((f) => ({
    applicant_id: idByCode.get(f.applicant_code)!,
    doc_key: f.doc_key,
    subitem_title: f.subitem_title,
    legacy_url: f.legacy_url,
    source: 'legacy',
  }));
  for (const c of chunk(fileRows)) must(await db.from('applicant_files').insert(c), 'applicant_files');

  console.log('[6/8] doc_reviews');
  const reviewRows = plan.reviews.map(({ applicant_code, ...r }) => ({ ...r, applicant_id: idByCode.get(applicant_code)! }));
  for (const c of chunk(reviewRows)) {
    must(await db.from('doc_reviews').upsert(c, { onConflict: 'applicant_id,doc_key,subitem_title' }), 'doc_reviews');
  }

  console.log('[7/8] admins (สร้างบัญชี Supabase Auth ที่ยังไม่มี)');
  const authByEmail = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error('listUsers: ' + error.message);
    data.users.forEach((u) => u.email && authByEmail.set(u.email.toLowerCase(), u.id));
    if (data.users.length < 1000) break;
  }
  for (const a of plan.admins) {
    let id = authByEmail.get(a.email);
    if (!id) {
      const { data, error } = await db.auth.admin.createUser({
        email: a.email,
        email_confirm: true,
        user_metadata: { full_name: a.full_name },
      });
      if (error) throw new Error(`createUser ${a.email}: ${error.message}`);
      id = data.user.id;
      console.log(`  สร้างบัญชี ${a.email}`);
    }
    const { created_at, ...rest } = a;
    must(
      await db.from('admins').upsert({ id, ...rest, ...(created_at ? { created_at } : {}) }, { onConflict: 'id' }),
      `admins ${a.email}`,
    );
  }

  console.log('[8/8] notification_log + audit_log');
  must(await db.from('notification_log').delete().eq('legacy', true), 'clear legacy notification_log');
  const notifRows = plan.notifications.map(({ applicant_code, created_at, ...n }) => ({
    ...n,
    ...(created_at ? { created_at } : {}),
    applicant_id: applicant_code ? idByCode.get(applicant_code) ?? null : null,
    legacy: true,
  }));
  for (const c of chunk(notifRows)) must(await db.from('notification_log').insert(c), 'notification_log');

  must(await db.from('audit_log').delete().eq('legacy', true), 'clear legacy audit_log');
  const auditRows = plan.audits.map(({ created_at, ...a }) => ({ ...a, ...(created_at ? { created_at } : {}), legacy: true }));
  for (const c of chunk(auditRows)) must(await db.from('audit_log').insert(c), 'audit_log');

  console.log('[+] แปลงหัวข้อที่เป็นจุดตรวจของ HR (ไฟล์ย้ายไปช่องหลัก, ผลตีกลับย้ายไปที่เอกสาร)');
  must(await db.rpc('convert_check_subitems'), 'convert_check_subitems');
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!file) {
    console.error('ใช้งาน: npm run migrate -- <ไฟล์ export.json> [--dry-run]');
    process.exit(1);
  }
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');

  const plan = buildMigrationPlan(JSON.parse(readFileSync(file, 'utf8')) as SheetExport);
  printPlan(plan);
  if (dryRun) {
    console.log('\n--dry-run: ไม่ได้เขียนข้อมูล');
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local');
  await load(createClient(url, key, { auth: { persistSession: false } }), plan);
  console.log('\nเสร็จแล้ว');
}

main().catch((err) => {
  console.error('\nย้ายข้อมูลไม่สำเร็จ:', err instanceof Error ? err.message : err);
  process.exit(1);
});
