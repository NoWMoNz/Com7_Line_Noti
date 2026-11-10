# Com7 Recruitment (เวอร์ชันใหม่)

ระบบติดตามเอกสารผู้สมัครงานผ่าน LINE สร้างใหม่แทนระบบเดิมบน Google Apps Script
(โปรเจกต์ `Document-line-notify`)

**Stack:** Next.js 16 (TypeScript) · Supabase (PostgreSQL + Storage + Auth) · Vercel · LINE Messaging API / LINE MINI App

ทำไมย้าย: จากการวัดจริง Apps Script เสียเวลาราว 0.8 วินาทีทุกครั้งที่หน้าเว็บเรียก server
แม้ฟังก์ชันจะไม่ทำงานอะไรเลย และ Google Sheets ไม่ใช่ฐานข้อมูลจริง

## สถานะ

| ส่วน | สถานะ |
|---|---|
| ฐานข้อมูล (schema + RLS + storage) | ✅ `supabase/migrations/0001_init.sql` |
| ย้ายข้อมูลจาก Google Sheets | ✅ `scripts/` |
| กฎสถานะเอกสาร (ใช้ร่วมกันทุกหน้า) | ✅ `src/lib/docs/status.ts` |
| LINE webhook (เมนู, รับไฟล์ผ่านแชท, ตรวจลายเซ็น) | ✅ `src/app/api/line/webhook` |
| หน้าผู้สมัคร (LINE MINI App): ลงทะเบียน, PDPA, อัปโหลด, ดูสถานะ | ⬜ |
| หน้าแอดมิน: Dashboard, ตรวจเอกสาร, แจ้งเริ่มงาน, สาขา, ผู้ใช้, ตั้งค่า | ⬜ |
| แจ้งเตือนอัตโนมัติ (ใกล้ deadline, ติดตาม 3 วัน) ด้วย Vercel Cron | ⬜ |
| ย้ายไฟล์จาก Google Drive เข้า Storage | ⬜ |

## โครงสร้าง

```
supabase/
  migrations/0001_init.sql   schema ทั้งหมด
  seed.sql                   ประเภทเอกสารตั้งต้น (สำหรับเครื่อง dev)
src/
  app/api/line/webhook/      LINE webhook (ตอบ 200 ทันที แล้วประมวลผลด้วย after())
  lib/docs/status.ts         กฎ "ส่งครบ / ต้องแก้ / อนุมัติ" — ที่เดียวในระบบ
  lib/line/                  ลายเซ็น, client, Flex Message, logic การสนทนา
  lib/repo/                  การเข้าถึงข้อมูล (interface + Supabase)
  lib/migration/transform.ts แปลงข้อมูลจากชีทเป็นแถวฐานข้อมูล
scripts/
  gas/ExportForMigration.gs  วางในโปรเจกต์ Apps Script เดิมเพื่อ export ข้อมูล
  migrate-from-sheets.ts     นำเข้าข้อมูลสู่ Supabase
tests/                       vitest (รวมการรัน migration จริงบน PGlite)
```

## เทียบกับระบบเดิม

| ระบบเดิม | ระบบใหม่ |
|---|---|
| ชีท Applicants (1 แถว/คน, เอกสาร 1 คอลัมน์/ชนิด) | `applicants` |
| URL ต่อกันในเซลล์ + tag `doc::หัวข้อ::url` | `applicant_files` (1 แถว/ไฟล์, เก็บประวัติไฟล์เก่า) |
| JSON ใน `doc_reviews_json` | `doc_reviews` (1 แถว/ช่อง) |
| ชีท DocConfig + JSON หัวข้อย่อย | `doc_types` + `doc_subitems` |
| ชีท Database | `branches` |
| Login Admin + hash รหัสผ่านในชีท | Supabase Auth + `admins` |
| Notification_Log / Audit_Log / Database_Logs | `notification_log` / `audit_log` |
| CacheService `pending_<uid>` | `line_pending_uploads` |
| ไฟล์ใน Drive แชร์แบบ "ทุกคนที่มีลิงก์" | Storage แบบ private + signed URL |

**สิ่งที่แก้ไปพร้อมกัน**

- ไฟล์ที่ส่งผ่านแชท LINE สำหรับเอกสารหลายหน้า (ใบสมัคร, เอกสารคนค้ำ, สำเนาคนค้ำ) ระบบเดิมบันทึกด้วย prefix
  `application::` แต่ Dashboard ค้นหา `doc1_application_set::` จึงอาจนับว่ายังไม่ส่ง
  ระบบใหม่เก็บเป็นแถวจึงไม่มีปัญหานี้ และสคริปต์ย้ายข้อมูลอ่านได้ทั้งสองแบบ
- webhook ตรวจ `X-Line-Signature` แล้ว (Apps Script ทำไม่ได้)
- ขนาดไฟล์ผ่านแชทไม่ถูกจำกัดที่ 2 MB อีกต่อไป (ตั้งได้ด้วย `MAX_UPLOAD_MB`)

## เริ่มต้น (เครื่อง dev)

```bash
npm install
cp .env.example .env.local     # ใส่ค่าตามคำอธิบายในไฟล์
npm test                       # unit test + ทดสอบ schema บน PGlite (ไม่ต้องมี Supabase)
npm run dev
```

### ตั้งค่า Supabase

1. สร้างโปรเจกต์ที่ supabase.com — **Region: Southeast Asia (Singapore)**
2. SQL Editor → รันไฟล์ `supabase/migrations/0001_init.sql`
   (ถ้ายังไม่ย้ายข้อมูลจริง รัน `supabase/seed.sql` ต่อเพื่อได้ประเภทเอกสารตั้งต้น)
3. Project Settings → API → คัดลอก URL และ Secret key ใส่ `.env.local`

### ตั้งค่า LINE

**Messaging API (แชท + webhook)** — ใช้ channel เดิมได้เลย ค่า Channel secret / access token อยู่ใน LINE Developers Console
ตอนพัฒนาให้ใช้ **channel ทดสอบแยก** ก่อน เพราะเปลี่ยน Webhook URL ของ channel จริงเมื่อไหร่
ผู้สมัครทุกคนจะคุยกับระบบใหม่ทันที

**หน้าผู้สมัคร = LINE MINI App** (ระบบเดิมใช้ LIFF ใน LINE Login channel —
LINE แนะนำให้แอปใหม่สร้างเป็น MINI App และจะรวม LIFF เข้ากับ MINI App ในอนาคต)

1. LINE Developers Console → **Provider เดียวกับ Messaging API channel** → Create a new channel → LINE MINI App
   - ⚠️ ต้องเป็น Provider เดียวกัน เพราะ LINE userId ต่างกันในแต่ละ Provider —
     ถ้าคนละ Provider หน้าเว็บจะได้ userId ไม่ตรงกับ webhook และข้อมูลที่ย้ายมา จับคู่ผู้สมัครไม่ได้
   - Region: Thailand
2. แท็บ Web app settings มี 3 internal channel แต่ละอันมี LIFF ID + Endpoint URL ของตัวเอง
   - **Developing** — ใช้ตอนพัฒนา เปิดได้เฉพาะ tester ที่เพิ่มไว้ใน channel
   - **Review** — ใช้เมื่อขอ verified (ต้องเป็น certified provider ผ่าน LINE for Business)
   - **Published** — ที่ผู้สมัครใช้จริง
3. Endpoint URL ตั้งเป็น `https://<โดเมน>/apply` แล้วใส่ LIFF ID ใน `NEXT_PUBLIC_LIFF_ID`
   (เครื่อง dev ใช้ของ Developing, production บน Vercel ใช้ของ Published)
4. ลิงก์ที่ระบบส่งให้ผู้สมัครเป็น `https://miniapp.line.me/<LIFF ID>?token=...`

ข้อจำกัดของ MINI App เทียบกับ LIFF ที่รู้แล้วว่าไม่กระทบระบบนี้: ใช้ได้เฉพาะขนาด Full, ซ่อนปุ่ม action ไม่ได้,
1 channel มีเว็บได้แอปเดียว (หน้าแอดมินเป็นเว็บธรรมดา ไม่ได้เปิดใน LINE)
แบบ unverified หัวหน้าจอจะแสดงชื่อโดเมนแทนชื่อแอป

> ⚠️ ใช้ `@line/liff` **v2.32.0 ขึ้นไป** — LINE จะจำกัด v2.20.0–v2.31.0 (มีช่องโหว่) ประมาณ 24 พ.ย. 2026
> ระบบเดิมบน Apps Script ก็โดนด้วยถ้ายังใช้เวอร์ชันในช่วงนั้น

## ย้ายข้อมูลจาก Google Sheets

1. เปิดโปรเจกต์ Apps Script เดิม → เพิ่มไฟล์ใหม่ → วางเนื้อหา `scripts/gas/ExportForMigration.gs`
2. รัน `exportForMigration` → ดาวน์โหลดไฟล์ JSON จาก URL ใน Execution log
   (ไม่ส่งออก hash รหัสผ่านและ token ของแอดมิน)
3. ทดลองก่อน: `npm run migrate -- ./com7-recruit-export-xxxx.json --dry-run`
   — ดูจำนวนแถวและคำเตือน เช่น LINE ID ซ้ำ, ผลตรวจที่อ้างถึงเอกสารที่ไม่มีแล้ว
4. นำเข้าจริง: `npm run migrate -- ./com7-recruit-export-xxxx.json`

> ⚠️ ไฟล์ export มีข้อมูลส่วนบุคคล (PDPA) — ห้าม commit (gitignore กันไว้แล้ว)
> ลบจาก Drive และจากเครื่องเมื่อย้ายเสร็จ

- รันซ้ำได้: ผู้สมัคร upsert ตามรหัสเดิม, ไฟล์และ log จากระบบเดิมถูกแทนที่
- ⚠️ ข้อมูลสาขาถูกแทนที่ทั้งหมดด้วยข้อมูลจากชีท — ใช้ก่อนเปิดระบบใหม่เท่านั้น
- token ในลิงก์ส่วนตัวของผู้สมัครย้ายมาด้วย ลิงก์เดิมจึงใช้กับระบบใหม่ได้
- ไฟล์เอกสารยังชี้ไปที่ Google Drive (`legacy_url`) — การย้ายไฟล์จริงเป็นงานขั้นสุดท้าย
- แอดมินได้บัญชี Supabase Auth แต่**ไม่มีรหัสผ่าน** (hash แบบเดิมย้ายไม่ได้)
  ต้องตั้งรหัสใหม่ผ่านลิงก์รีเซ็ต/เชิญ เมื่อหน้าแอดมินพร้อม

## ลำดับการเปลี่ยนระบบ (cutover)

webhook ใหม่ย้ายเดี่ยวๆ ไม่ได้ เพราะระบบเดิมยังเขียนผู้สมัครใหม่ลง Google Sheets
ต้องย้ายทุกส่วนที่เขียนข้อมูลพร้อมกัน:

1. ทำหน้าผู้สมัคร + หน้าแอดมินให้เสร็จ ทดสอบกับ LINE channel ทดสอบ + ข้อมูลที่ย้ายมา
2. วันเปลี่ยนระบบ: ปิดหน้าเว็บเดิม → export + migrate รอบสุดท้าย
3. LINE Developers Console:
   - Messaging API → เปลี่ยน Webhook URL เป็น `https://<โดเมน>/api/line/webhook`
   - LIFF app **เดิม** (ใน LINE Login channel) → เปลี่ยน Endpoint URL เป็น `https://<โดเมน>/apply`
     เพื่อให้ลิงก์ `liff.line.me/<ID เดิม>?token=...` ที่ผู้สมัครได้ไปแล้วในแชทยังเปิดหน้าใหม่ได้
     (token ย้ายมาแล้ว) — อย่าลบ LIFF app เดิมจนกว่าลิงก์เก่าจะไม่มีคนใช้
   - Rich menu → เปลี่ยนปุ่มที่เปิดหน้าผู้สมัครเป็นลิงก์ MINI App (`https://miniapp.line.me/<LIFF ID ของ Published>`)
4. ถ้ามีปัญหา: เปลี่ยน Webhook URL, Endpoint URL ของ LIFF เดิม และ Rich menu กลับเป็นของเดิมได้ทันที

## คำถามที่ต้องตรวจกับข้อมูลจริง

- **หัวข้อย่อยใน DocConfig** บางรายการดูเหมือน "จุดที่ HR ต้องเช็ค" มากกว่า "ไฟล์ที่ต้องส่ง"
  เช่น สำเนาบัตรประชาชน → `เซ็นรับรอง`, `วันหมดอายุบัตร`
  ระบบเดิมและระบบใหม่ถือว่าทุกหัวข้อย่อยเป็นช่องไฟล์ ถ้าไม่ใช่ ต้องแยกเป็น checklist ของแอดมิน
