-- ข้อมูลตั้งต้นสำหรับเครื่อง dev / โปรเจกต์ใหม่ที่ยังไม่ได้ย้ายข้อมูล
-- คัดลอกมาจาก setupSpreadsheet() ของระบบเดิม
-- (ระบบจริงให้ใช้ scripts/migrate-from-sheets.ts ซึ่งดึงค่าจากชีท DocConfig จริงแทน)

insert into doc_types (key, label, description, sort_order, optional, covers_all) values
  ('doc0_all_in_one',      'รวมเอกสารทุกอย่างไว้ในไฟล์เดียว (ถ้ามี)', 'หากผู้สมัครสแกน/ถ่ายรูปเอกสารทุกอย่างรวมเป็นไฟล์เดียว (PDF หรือรูปภาพ) สามารถอัปโหลดที่ช่องนี้แทนการอัปโหลดแยกทีละรายการด้านล่างได้ทันที', 0, true, true),
  ('doc1_application_set', '1. ใบสมัคร',                 'ติดรูปถ่ายพนักงาน',                  1, false, false),
  ('doc3_id_card',         '3. สำเนาบัตรประชาชน',         'เซ็นสำเนาถูกต้อง',                   2, false, false),
  ('doc4_house_reg',       '4. สำเนาทะเบียนบ้าน',          'เซ็นสำเนาถูกต้อง',                   3, false, false),
  ('doc5_transcript',      '5. สำเนาวุฒิการศึกษา',         'เซ็นสำเนาถูกต้อง',                   4, false, false),
  ('doc6_guarantor',       '6. เอกสารค้ำประกัน',           'หน้าที่ 2 เซ็นให้เหมือนสำเนาอื่นๆ',      5, false, false),
  ('doc7_criminal_check',  '7. เอกสารตรวจสอบประวัติ',      'กรอกข้อมูลตามตัวอย่าง',               6, false, false),
  ('doc8_health_check',    '8. ผลตรวจสุขภาพ',             '',                                  7, false, false),
  ('doc9_health_receipt',  '9. ใบเสร็จตรวจสุขภาพ',         '',                                  8, false, false),
  ('doc10_bookbank',       '10. บัญชีเงินเดือน',           'สำหรับรับเงินเดือน',                  9, false, false),
  ('doc11_guarantor_copy', '11. สำเนาเอกสารคนค้ำ',         'เซ็นสำเนาถูกต้องทุกหน้า',              10, false, false),
  ('doc12_kyc',            '12. KYC ยืนยันตัวตนคนค้ำ',     'ถ่ายรูปยืนยันบุคคล',                  11, false, false)
on conflict (key) do nothing;

insert into doc_subitems (doc_key, title, sort_order, optional) values
  ('doc1_application_set', 'ใบสมัครหน้าที่ 1', 0, false),
  ('doc1_application_set', 'ใบสมัครหน้าที่ 2', 1, false),
  ('doc1_application_set', 'ใบสมัครหน้าที่ 3', 2, false),
  ('doc3_id_card',         'เซ็นรับรอง', 0, false),
  ('doc3_id_card',         'วันหมดอายุบัตร', 1, false),
  ('doc4_house_reg',       'เซ็นรับรอง', 0, false),
  ('doc4_house_reg',       'เอกสารเปลี่ยนชื่อจริง-นามสกุล (ถ้ามี)', 1, true),
  ('doc5_transcript',      'เซ็นรับรอง', 0, false),
  ('doc5_transcript',      'TRANSCRIPT', 1, false),
  ('doc6_guarantor',       'เอกสารคนค้ำ หน้าที่ 1', 0, false),
  ('doc6_guarantor',       'เอกสารคนค้ำ หน้าที่ 2', 1, false),
  ('doc6_guarantor',       'เอกสารคนค้ำ หน้าที่ 3', 2, false),
  ('doc7_criminal_check',  'เช็คครบทุกจุดที่กำหนด', 0, false),
  ('doc8_health_check',    'ตรวจครบทุกรายการ', 0, false),
  ('doc10_bookbank',       'เซ็นรับรอง', 0, false),
  ('doc11_guarantor_copy', 'สำเนาบัตรประชาชน', 0, false),
  ('doc11_guarantor_copy', 'สำเนาทะเบียนบ้าน', 1, false),
  ('doc11_guarantor_copy', 'สลิปเงินเดือน (ถ้ามี)', 2, true),
  ('doc11_guarantor_copy', 'บัตรข้าราชการ (ถ้ามี)', 3, true)
on conflict do nothing;
