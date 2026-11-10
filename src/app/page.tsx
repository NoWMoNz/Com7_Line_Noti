const PHASES = [
  { done: true, title: 'ฐานข้อมูล + ย้ายข้อมูลจาก Google Sheets', detail: 'schema, สคริปต์ย้ายข้อมูล, กฎสถานะเอกสาร' },
  { done: true, title: 'LINE webhook', detail: 'เมนูเอกสาร, รับไฟล์ผ่านแชท, ตรวจลายเซ็น LINE' },
  { done: false, title: 'หน้าผู้สมัคร (LINE MINI App)', detail: 'ลงทะเบียน, PDPA, อัปโหลดเอกสาร, ดูสถานะ' },
  { done: false, title: 'หน้าแอดมิน', detail: 'Dashboard, ตรวจเอกสาร, แจ้งเริ่มงาน, สาขา, ผู้ใช้' },
  { done: false, title: 'งานตามเวลา + ย้ายไฟล์จาก Drive', detail: 'แจ้งเตือนอัตโนมัติ, ติดตาม 3 วัน, ปิดระบบเดิม' },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <p className="text-sm font-semibold text-brand">Com7 Recruitment</p>
      <h1 className="mt-1 text-2xl font-bold">ระบบติดตามเอกสารผู้สมัคร — เวอร์ชันใหม่</h1>
      <p className="mt-2 text-muted">กำลังพัฒนาเพื่อแทนระบบเดิมบน Google Apps Script</p>

      <ol className="mt-8 divide-y divide-line rounded-lg border border-line">
        {PHASES.map((p) => (
          <li key={p.title} className="flex gap-3 px-4 py-3">
            <span
              aria-hidden
              className={`mt-1.5 size-2.5 shrink-0 rounded-full ${p.done ? 'bg-brand' : 'border border-muted'}`}
            />
            <div>
              <p className="font-medium">
                {p.title}
                <span className="sr-only">{p.done ? ' (เสร็จแล้ว)' : ' (ยังไม่เริ่ม)'}</span>
              </p>
              <p className="text-sm text-muted">{p.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
