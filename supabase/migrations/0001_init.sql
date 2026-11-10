-- =============================================================================
-- Com7 Recruitment — schema เริ่มต้น
--
-- แทนที่ Google Sheets ของระบบเดิม (Document-line-notify / Apps Script)
--   ชีท DocConfig        → doc_types + doc_subitems
--   ชีท Database         → branches
--   ชีท Applicants       → applicants + applicant_files + doc_reviews
--   ชีท Login Admin      → admins (ผูกกับ Supabase Auth)
--   ชีท Config           → settings (ค่าลับย้ายไป environment variables)
--   Notification_Log     → notification_log
--   Audit_Log / Database_Logs → audit_log
--   CacheService pending_ → line_pending_uploads
--
-- ความปลอดภัย: เปิด RLS ทุกตารางและไม่มี policy → anon/authenticated อ่านเขียนไม่ได้
-- ทุกการเข้าถึงผ่านโค้ดฝั่ง server ด้วย secret key (bypass RLS) เท่านั้น
-- =============================================================================

-- ---------- helper: updated_at อัตโนมัติ ----------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- ประเภทเอกสาร (เดิม: DocConfig) ----------
create table doc_types (
  key          text primary key,
  label        text not null,
  description  text not null default '',
  sort_order   int  not null default 0,
  enabled      boolean not null default true,
  -- ไม่บังคับส่ง (ไม่นับในความครบถ้วน)
  optional     boolean not null default false,
  -- ไฟล์รวม (doc0_all_in_one): ถ้ามีและไม่ถูกตีกลับ ถือว่าครอบคลุมเอกสารอื่นทั้งหมด
  covers_all   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger doc_types_updated_at before update on doc_types
  for each row execute function set_updated_at();

-- หัวข้อย่อย = ช่องไฟล์ย่อยของเอกสาร เช่น "ใบสมัครหน้าที่ 1" (เดิม: JSON ในคอลัมน์ doc_subitems)
create table doc_subitems (
  doc_key     text not null references doc_types(key) on update cascade on delete cascade,
  title       text not null,
  sort_order  int  not null default 0,
  optional    boolean not null default false,
  primary key (doc_key, title)
);

-- ---------- สาขา (เดิม: ชีท Database) ----------
create table branches (
  id          bigint generated always as identity primary key,
  shop_code   text,
  shop_name   text not null,
  company     text not null default 'Com7',
  main_unit   text,
  rsm         text,
  asm         text,
  province    text,
  region      text,
  ta          text,
  intern      text,
  label       text generated always as (
                case when coalesce(shop_code, '') = '' then shop_name
                     else shop_code || ' - ' || shop_name end
              ) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index branches_label_idx on branches (label);
create trigger branches_updated_at before update on branches
  for each row execute function set_updated_at();

-- ---------- ผู้สมัคร (เดิม: ชีท Applicants) ----------
create table applicants (
  id                   uuid primary key default gen_random_uuid(),
  -- รหัสที่แสดงในหน้าแอดมิน (เดิม applicant_id เช่น APP_1a2b3c4d5e)
  code                 text not null unique
                         default 'APP_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  name                 text not null default '',
  phone                text,                    -- รูปแบบ 0xxxxxxxxx
  branch_label         text,                    -- ข้อความสาขาตามที่กรอก/เลือก
  branch_id            bigint references branches(id) on delete set null,
  company              text,
  position             text,
  ta                   text,
  intern               text,
  notes                text not null default '',
  admin_feedback       text not null default '',
  salary               numeric,
  start_date           date,
  deadline             timestamptz,
  line_user_id         text unique,
  -- token ในลิงก์ส่วนตัวของผู้สมัคร (ย้ายค่าเดิมมาตรงๆ เพื่อให้ลิงก์เก่ายังใช้ได้)
  access_token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  approved             boolean not null default false,
  -- ชุดเอกสารที่ล็อกไว้ของคนนี้ (เดิม required_docs_json) — null = ใช้ชุดที่เปิดใช้งานปัจจุบัน
  required_doc_keys    text[],
  pdpa_version         text,
  pdpa_accepted_at     timestamptz,
  pdpa_line_user_id    text,
  onboard_notified_at  timestamptz,
  onboard_notes        text not null default '',
  onboard_updated_at   timestamptz,
  onboard_updated_by   text,
  last_uploaded_at     timestamptz,
  last_notified_at     timestamptz,
  admin_reviewed_at    timestamptz,
  completed_at         timestamptz,
  followup_sent_at     timestamptz,
  followup_status      text,
  legacy_drive_folder_id text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index applicants_phone_idx on applicants (phone);
create index applicants_created_at_idx on applicants (created_at desc);
create trigger applicants_updated_at before update on applicants
  for each row execute function set_updated_at();

-- ---------- ไฟล์ที่อัปโหลด (เดิม: URL ต่อกันในเซลล์ + tag "doc::หัวข้อ::url") ----------
create table applicant_files (
  id             uuid primary key default gen_random_uuid(),
  applicant_id   uuid not null references applicants(id) on delete cascade,
  doc_key        text not null references doc_types(key) on update cascade,
  subitem_title  text not null default '',      -- '' = ไฟล์ของเอกสารทั้งชิ้น
  storage_path   text,                          -- path ใน bucket applicant-docs
  legacy_url     text,                          -- ลิงก์ Google Drive จากระบบเดิม
  mime_type      text,
  size_bytes     bigint,
  source         text not null default 'web'
                   check (source in ('web', 'line', 'admin', 'legacy')),
  -- ไฟล์ที่ถูกแทนที่ด้วยไฟล์ใหม่ → false (เก็บไว้เป็นประวัติ ไม่ลบทิ้ง)
  is_current     boolean not null default true,
  created_at     timestamptz not null default now(),
  check (storage_path is not null or legacy_url is not null)
);
create index applicant_files_slot_idx
  on applicant_files (applicant_id, doc_key, subitem_title) where is_current;

-- ---------- ผลตรวจเอกสาร (เดิม: doc_reviews_json) ----------
create table doc_reviews (
  applicant_id   uuid not null references applicants(id) on delete cascade,
  doc_key        text not null references doc_types(key) on update cascade on delete cascade,
  subitem_title  text not null default '',      -- '' = ผลตรวจของเอกสารทั้งชิ้น
  status         text not null check (status in ('pending_review', 'approved', 'rejected')),
  reason         text not null default '',
  reviewed_by    text,                          -- ชื่อแอดมิน (null = ระบบตั้งตอนผู้สมัครอัปโหลด)
  updated_at     timestamptz not null default now(),
  primary key (applicant_id, doc_key, subitem_title)
);

-- ---------- แอดมิน (เดิม: Login Admin — รหัสผ่านย้ายไปอยู่ใน Supabase Auth) ----------
create table admins (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null unique,
  full_name        text not null default '',
  role             text not null default 'Admin'
                     check (role in ('Developer', 'SuperAdmin', 'Admin2', 'Admin')),
  active           boolean not null default true,
  legacy_admin_id  text unique,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------- ค่าตั้งค่าที่ไม่ลับ (เดิม: ชีท Config) ----------
create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
create trigger settings_updated_at before update on settings
  for each row execute function set_updated_at();

-- ---------- สถานะ "กำลังรอไฟล์" ของแชท LINE (เดิม: CacheService pending_<uid> 10 นาที) ----------
create table line_pending_uploads (
  line_user_id   text primary key,
  doc_key        text not null references doc_types(key) on update cascade on delete cascade,
  subitem_title  text not null default '',
  expires_at     timestamptz not null default now() + interval '10 minutes'
);

-- ---------- log ----------
create table notification_log (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  type             text not null,
  applicant_id     uuid references applicants(id) on delete set null,
  applicant_name   text,
  phone            text,
  sent_by          text not null default 'System',
  status           text not null default 'ok',
  message_preview  text,
  error            text,
  legacy           boolean not null default false
);
create index notification_log_created_idx on notification_log (created_at desc);

-- รวม Audit_Log (แอดมินแก้ข้อมูล) และ Database_Logs (กิจกรรมทั่วไป) ไว้ที่เดียว แยกด้วย kind
create table audit_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  kind         text not null default 'audit' check (kind in ('audit', 'activity')),
  actor        text not null default 'System',
  action       text not null,
  target_id    text,
  target_name  text,
  field        text,
  old_value    text,
  new_value    text,
  detail       text,
  legacy       boolean not null default false
);
create index audit_log_created_idx on audit_log (created_at desc);
create index audit_log_target_idx on audit_log (target_id);

-- ---------- RLS: ปิดการเข้าถึงจาก client ทั้งหมด ----------
alter table doc_types            enable row level security;
alter table doc_subitems         enable row level security;
alter table branches             enable row level security;
alter table applicants           enable row level security;
alter table applicant_files      enable row level security;
alter table doc_reviews          enable row level security;
alter table admins               enable row level security;
alter table settings             enable row level security;
alter table line_pending_uploads enable row level security;
alter table notification_log     enable row level security;
alter table audit_log            enable row level security;

-- ---------- Storage: เก็บไฟล์เอกสารแบบ private ----------
-- เดิมไฟล์ใน Drive ถูกตั้งเป็น "ทุกคนที่มีลิงก์เปิดได้" — ระบบใหม่ให้ดูผ่าน signed URL ที่หมดอายุเองเท่านั้น
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'applicant-docs', 'applicant-docs', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
