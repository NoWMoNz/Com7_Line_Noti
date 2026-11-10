-- =============================================================================
-- หัวข้อย่อย 2 ชนิด
--   file  = ช่องที่ผู้สมัครต้องอัปโหลด (เช่น ใบสมัครหน้าที่ 1, 2, 3)
--   check = จุดที่ HR ต้องตรวจในไฟล์ (เช่น เซ็นรับรอง, วันหมดอายุบัตร) — ผู้สมัครไม่ต้องอัปโหลดแยก
--
-- ระบบเดิมถือทุกหัวข้อเป็นช่องอัปโหลด ผู้สมัครจึงต้องอัปโหลดบัตรประชาชนใบเดียวกัน 2 ครั้ง
-- ("เซ็นรับรอง" กับ "วันหมดอายุบัตร")
-- =============================================================================
alter table doc_subitems add column kind text not null default 'file' check (kind in ('file', 'check'));

-- ย้ายข้อมูลของหัวข้อชนิด check ทุกตัว: ไฟล์ → ช่องหลัก, ผลตีกลับ → ตัวเอกสาร — เรียกซ้ำได้
-- (หน้าตั้งค่าเอกสารเรียกหลังบันทึก เผื่อ HR เปลี่ยนหัวข้อที่มีไฟล์แล้วเป็น "HR ตรวจ")
create or replace function public.move_check_subitem_data() returns void
language plpgsql
set search_path = ''
as $$
begin
  -- ไฟล์ที่เคยส่งเข้าหัวข้อตรวจ → ช่องหลักของเอกสาร (ไม่มีไฟล์หาย)
  update public.applicant_files f
     set subitem_title = ''
    from public.doc_subitems s
   where s.kind = 'check' and f.doc_key = s.doc_key and f.subitem_title = s.title;

  -- หัวข้อตรวจที่เคยถูกตีกลับ → ย้ายเหตุผลไปที่ตัวเอกสาร (ถ้าเอกสารยังไม่อนุมัติ)
  insert into public.doc_reviews (applicant_id, doc_key, subitem_title, status, reason, reviewed_by, updated_at)
  select r.applicant_id, r.doc_key, '', 'rejected',
         string_agg(r.subitem_title || ': ' || r.reason, ' / ' order by r.subitem_title),
         max(r.reviewed_by), max(r.updated_at)
    from public.doc_reviews r
    join public.doc_subitems s on s.kind = 'check' and s.doc_key = r.doc_key and s.title = r.subitem_title
   where r.status = 'rejected'
   group by r.applicant_id, r.doc_key
  on conflict (applicant_id, doc_key, subitem_title) do update
     set status = 'rejected', reason = excluded.reason, reviewed_by = excluded.reviewed_by, updated_at = excluded.updated_at
   where public.doc_reviews.status <> 'approved';

  delete from public.doc_reviews r
   using public.doc_subitems s
   where s.kind = 'check' and s.doc_key = r.doc_key and r.subitem_title = s.title;
end;
$$;

-- กำหนดหัวข้อของระบบเดิมที่เป็นจุดตรวจ แล้วย้ายข้อมูล
-- เรียกครั้งแรกที่นี่ และอีกครั้งหลังสคริปต์ย้ายข้อมูลจากชีทนำเข้า DocConfig (ซึ่งเขียนหัวข้อย่อยใหม่ทั้งชุด)
create or replace function public.convert_check_subitems() returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.doc_subitems s
     set kind = 'check'
    from (values
      ('doc3_id_card', 'เซ็นรับรอง'),
      ('doc3_id_card', 'วันหมดอายุบัตร'),
      ('doc4_house_reg', 'เซ็นรับรอง'),
      ('doc4_house_reg', 'เอกสารเปลี่ยนชื่อจริง-นามสกุล (ถ้ามี)'),
      ('doc5_transcript', 'เซ็นรับรอง'),
      ('doc5_transcript', 'TRANSCRIPT'),
      ('doc7_criminal_check', 'เช็คครบทุกจุดที่กำหนด'),
      ('doc8_health_check', 'ตรวจครบทุกรายการ'),
      ('doc10_bookbank', 'เซ็นรับรอง')
    ) as c(doc_key, title)
   where s.doc_key = c.doc_key and s.title = c.title;

  perform public.move_check_subitem_data();
end;
$$;

-- ห้ามเรียกผ่าน API ด้วยคีย์สาธารณะ — เฉพาะ service role (สคริปต์ฝั่ง server)
revoke execute on function public.convert_check_subitems() from public, anon, authenticated;
revoke execute on function public.move_check_subitem_data() from public, anon, authenticated;
grant execute on function public.convert_check_subitems() to service_role;
grant execute on function public.move_check_subitem_data() to service_role;

select public.convert_check_subitems();

-- เลิกรับเอกสารผ่านแชท LINE (ส่งผ่าน MINI App ทางเดียว) — ไม่ต้องเก็บสถานะ "รอไฟล์" อีก
drop table line_pending_uploads;
