/**
 * วางไฟล์นี้ในโปรเจกต์ Apps Script "ระบบเดิม" (Document-line-notify) แล้วรัน exportForMigration()
 * จาก editor หนึ่งครั้ง → ได้ไฟล์ JSON ใน Google Drive ของคุณ (ดู URL ใน Execution log)
 *
 * - อ่านอย่างเดียว ไม่แก้ข้อมูลในชีท
 * - ไม่รวม CHANNEL_ACCESS_TOKEN (อยู่ใน Script Properties ไม่ได้อยู่ในชีท)
 * - ไฟล์นี้มีข้อมูลส่วนบุคคลของผู้สมัคร (PDPA): ไฟล์ถูกสร้างเป็น private
 *   ดาวน์โหลดไปใช้แล้วให้ลบทิ้งจาก Drive และจากเครื่องหลังย้ายเสร็จ
 */
function exportForMigration() {
  const SHEETS = [
    'Applicants', 'DocConfig', 'Config', 'Database', 'Login Admin',
    'Notification_Log', 'Audit_Log', 'Database_Logs'
  ];
  const ss = getSpreadsheet_();
  const out = { exportedAt: new Date().toISOString(), timeZone: Session.getScriptTimeZone(), sheets: {} };

  SHEETS.forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const values = sh.getDataRange().getValues();
    out.sheets[name] = values.map(function (row) {
      return row.map(function (v) {
        if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
        return v;
      });
    });
  });

  // ไม่ส่งออก hash รหัสผ่าน/โทเคน session ของแอดมิน — ระบบใหม่ใช้ Supabase Auth
  const admin = out.sheets['Login Admin'];
  if (admin && admin.length) {
    const header = admin[0].map(function (h) { return String(h).trim(); });
    const drop = ['password', 'remember_token', 'remember_expiry'].map(function (h) { return header.indexOf(h); })
      .filter(function (i) { return i !== -1; });
    out.sheets['Login Admin'] = admin.map(function (row) {
      return row.filter(function (_, i) { return drop.indexOf(i) === -1; });
    });
  }

  const name = 'com7-recruit-export-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmm') + '.json';
  const file = DriveApp.createFile(name, JSON.stringify(out), MimeType.PLAIN_TEXT);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  Logger.log('ส่งออกแล้ว: ' + file.getUrl());
  Object.keys(out.sheets).forEach(function (k) {
    Logger.log('  ' + k + ': ' + Math.max(0, out.sheets[k].length - 1) + ' แถว');
  });
  return file.getUrl();
}
