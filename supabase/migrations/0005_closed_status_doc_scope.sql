-- =============================================================================
-- 1) ปิดใบสมัคร: Cancel (ยกเลิก) / Turndown (ผู้สมัครปฏิเสธ)
--    ผู้สมัครที่ปิดแล้วย้ายไปแท็บ "ยกเลิก/Turndown" — ไม่ถูกเตือนเอกสาร ไม่ขึ้นหน้าแจ้งเริ่มงาน
--    HR คืนสถานะได้ (ตั้ง closed_status = null)
--
-- 2) กลุ่มเอกสาร: "ส่งเบื้องต้น" / "ส่งทั้งหมด"
--    doc_types.initial = เอกสารที่อยู่ในชุดเบื้องต้น (ตั้งที่หน้าตั้งค่าเอกสาร)
--    applicants.doc_scope = ผู้สมัครคนนี้ต้องส่งชุดไหน (ค่าเริ่มต้น all = เหมือนเดิม)
-- =============================================================================
alter table applicants
  add column closed_status text check (closed_status in ('cancel', 'turndown')),
  add column closed_reason text not null default '',
  add column closed_at     timestamptz,
  add column closed_by     text,
  add column doc_scope     text not null default 'all' check (doc_scope in ('initial', 'all'));

create index applicants_closed_status_idx on applicants (closed_status) where closed_status is not null;

alter table doc_types add column initial boolean not null default false;
