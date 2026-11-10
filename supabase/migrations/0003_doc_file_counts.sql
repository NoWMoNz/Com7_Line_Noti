-- จำนวนไฟล์ปัจจุบันต่อเอกสาร/หัวข้อย่อย — หน้าตั้งค่าเอกสารใช้เตือนก่อนลบ/เปลี่ยนหัวข้อ
-- security_invoker: ใช้สิทธิ์ของผู้เรียก → RLS ของ applicant_files ยังมีผล (anon อ่านไม่ได้)
create view doc_file_counts with (security_invoker = true) as
  select doc_key, subitem_title, count(*)::int as file_count
  from applicant_files
  where is_current
  group by doc_key, subitem_title;
