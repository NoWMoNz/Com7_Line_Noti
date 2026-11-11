/**
 * แจ้งเตือนเริ่มงาน — ย้ายมาจากส่วน ONBOARDING ของ AdminApplicants.gs (ข้อความ/การ์ดเหมือนเดิม)
 * ไฟล์นี้ไม่มีโค้ดฝั่ง server ใช้ได้ทั้งหน้าเว็บ (ดูตัวอย่างข้อความ) และ server (ส่งจริง)
 */
import { normalizeCompany } from '@/lib/apply/forms';
import type { FlexBubble, FlexComponent } from '@/lib/line/types';

export interface OnboardTemplate {
  label: string;
  color: string;
  template: string;
}
export type OnboardTemplates = Record<string, OnboardTemplate>;

/** เก็บในตาราง settings ด้วย key เดียวกับชีท Config เดิม */
export const ONBOARD_TEMPLATES_KEY = 'ONBOARD_TEMPLATES';

export const DEFAULT_ONBOARD_TEMPLATES: OnboardTemplates = {
  Com7: {
    label: 'Com7',
    color: '#47A838',
    template:
      'ยืนยันข้อมูลการเริ่มงาน\n\nเอกสารของคุณครบถ้วนและอนุมัติเรียบร้อยแล้ว !\nกรุณาตรวจสอบข้อมูล\n\nรายละเอียด\nวันที่เริ่มงาน: {{startDate}}\nชื่อ-นามสกุล: {{name}}\nตำแหน่ง: {{position}}\nสาขา: {{branch}}\nเงินเดือน: {{salary}} บาท/เดือน\n\nหมายเหตุ\n1.กรุณามาถึงสาขาก่อนเวลา 10.00 น. ในวันแรก\n2.การแต่งกาย : เสื้อยืด สีดำ / กางเกงยีนส์ (ไม่ขาด ไม่ฟอก) / รองเท้าผ้าใบ หุ้มส้น\n3.นำเอกสารสมัครงานตัวจริงทั้งหมด มาส่งหน้าร้านในวันเริ่มงาน\n4.ตรวจสอบรหัสพนักงานของตนเองได้ที่ Link : https://shorturl.at/Jf4wP',
  },
  Double7: {
    label: 'Double7',
    color: '#47A838',
    template:
      'ยืนยันข้อมูลการเริ่มงาน\n\nเอกสารของคุณครบถ้วนและอนุมัติเรียบร้อยแล้ว !\nกรุณาตรวจสอบข้อมูล\n\nรายละเอียด\nวันที่เริ่มงาน: {{startDate}}\nชื่อ-นามสกุล: {{name}}\nตำแหน่ง: {{position}}\nสาขา: {{branch}}\nเงินเดือน: {{salary}} บาท/เดือน\n\nหมายเหตุ\n1.กรุณามาถึงสาขาก่อนเวลา 10.00 น. ในวันแรก\n2.การแต่งกาย : เสื้อโปโล สีขาว / กางเกงกระบอกเอี๊ยม สียีนส์เข้ม / รองเท้าผ้าใบสีขาวไม่มีลวดลาย\n3.นำเอกสารสมัครงานตัวจริงทั้งหมด มาส่งหน้าร้านในวันเริ่มงาน\n4.ตรวจสอบรหัสพนักงานของตนเองได้ที่ Link : https://shorturl.at/Jf4wP',
  },
  Default: {
    label: 'ทั่วไป',
    color: '#64748B',
    template:
      'ยืนยันข้อมูลการเริ่มงาน\n\nเอกสารของคุณครบถ้วนและอนุมัติเรียบร้อยแล้ว!\nกรุณาตรวจสอบข้อมูล\n\nรายละเอียด\nวันที่เริ่มงาน: {{startDate}}\nชื่อ-นามสกุล: {{name}}\nตำแหน่ง: {{position}}\nสาขา: {{branch}}\nเงินเดือน: {{salary}} บาท/เดือน\n\nหมายเหตุเพิ่มเติม\n{{notes}}',
  },
};

/** ค่าที่เก็บไว้ (อาจไม่ครบ/ผิดรูป) + ค่าตั้งต้น → เทมเพลตที่ใช้ได้เสมอ */
export function mergeTemplates(stored: unknown): OnboardTemplates {
  const out: OnboardTemplates = { ...DEFAULT_ONBOARD_TEMPLATES };
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
      const t = (v ?? {}) as Partial<OnboardTemplate>;
      if (typeof t.template !== 'string') continue;
      out[k] = { label: String(t.label || k), color: String(t.color || '#64748B'), template: t.template };
    }
  }
  return out;
}

export function resolveTemplateKey(company: string, templates: OnboardTemplates): string {
  const u = company.trim();
  if (templates[u]) return u;
  const lower = u.toLowerCase().replace(/\s+/g, '');
  if (lower.includes('double7') || lower.includes('db7')) return 'Double7';
  if (lower.includes('com7')) return 'Com7';
  return 'Default';
}

export interface OnboardEmployee {
  name: string;
  phone: string;
  branch: string;
  company: string;
  position: string;
  startDate: string | null; // YYYY-MM-DD
  salary: number | null;
  ta: string;
  notes: string;
}

export interface BranchRef {
  id: number;
  label: string;
  company: string;
  shopName?: string;
  /** รหัสสาขา — label ในตารางเป็น "<รหัส> - <ชื่อร้าน>" */
  shopCode?: string;
  ta?: string;
  intern?: string;
}

/** รหัสสาขาที่ขึ้นต้นข้อความ: "9 - ID 9_BN_Zeer" / "ID3180: Studio7" → "9" / "3180" */
export function leadingShopCode(text: string): string | null {
  return text.match(/^\s*(?:id\s*)?(\d+)\s*[-:]/i)?.[1] ?? null;
}

/**
 * สาขาที่ข้อความนี้หมายถึงแน่ๆ: ตรงทั้งข้อความ (ไม่สนตัวพิมพ์/ช่องว่างซ้ำ) หรือรหัสสาขาตรงกัน
 * ใช้ตอนกรอกฟอร์ม (ไม่จับแบบคร่าวๆ — กำลังพิมพ์อยู่จะได้ไม่ล็อกผิดสาขา)
 */
export function exactBranch<T extends BranchRef>(text: string, branches: T[]): T | null {
  const t = squash(text);
  if (!t) return null;
  const code = leadingShopCode(text);
  return (
    branches.find((b) => squash(b.label) === t) ??
    (code ? branches.find((b) => (b.shopCode ?? '').trim() === code) : undefined) ??
    null
  );
}

const squash = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
/** ตัดเครื่องหมาย (- _ : ( ) ' ’ .) ให้เหลือคำ — ค้นหา "bangbon samsung" เจอ "ID 3285  Samsung Big C BangBon" */
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();

/** ค้นหาสาขา: ทุกคำที่พิมพ์ต้องอยู่ในชื่อสาขา (ลำดับคำไม่สำคัญ) — รหัสสาขาตรงเป๊ะขึ้นก่อน */
export function searchBranches<T extends BranchRef>(query: string, branches: T[], limit = 30): T[] {
  const tokens = words(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const hits = branches.filter((b) => {
    const hay = words(`${b.label} ${b.shopName ?? ''}`);
    return tokens.every((t) => hay.includes(t));
  });
  const q = query.trim();
  hits.sort((a, b) => Number((b.shopCode ?? '') === q) - Number((a.shopCode ?? '') === q));
  return hits.slice(0, limit);
}

/**
 * ค่าที่ต้องเป็นไปตามตารางสาขา เมื่อผู้สมัครผูกสาขาแล้ว — บริษัทเสมอ, TA/Intern เฉพาะที่สาขาระบุไว้
 * (สาขาไม่ได้ระบุ TA → ให้กรอกเองได้)
 */
export function branchLockedFields(b: BranchRef): { company: string; ta?: string; intern?: string } {
  const out: { company: string; ta?: string; intern?: string } = { company: normalizeCompany(b.company) ?? b.company };
  if (b.ta?.trim()) out.ta = b.ta.trim();
  if (b.intern?.trim()) out.intern = b.intern.trim();
  return out;
}

/** หาสาขาจากข้อความ (lookupCompanyForBranch_ เดิม: ตรงกันทั้งข้อความ หรือมีชื่อร้านอยู่ในข้อความ) */
export function findBranch(text: string, branches: Array<BranchRef>): BranchRef | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  return (
    exactBranch(text, branches) ??
    branches.find((b) => (b.shopName ?? '').toLowerCase() === t) ??
    branches.find((b) => b.label.toLowerCase().includes(t) || (!!b.shopName && t.includes(b.shopName.toLowerCase()))) ??
    null
  );
}

/** "ID1234 - Studio7 สยาม" → "Studio7 สยาม" */
export function cleanBranchDisplay(branch: string): string {
  const s = branch.trim();
  const cleaned = s.replace(/^(?:ID)?\d+\s*-\s*/i, '').replace(/^ID\s+/i, '').trim();
  return cleaned || s;
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-12-01" → "1 ธ.ค. 2569" (ไม่ขึ้นกับ timezone ของเครื่อง) */
export function formatThaiDate(date: string | null): string {
  if (!date) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

const salaryText = (n: number | null) => (n ? n.toLocaleString('th-TH') : '-');

export function fillTemplate(template: string, emp: OnboardEmployee): string {
  const notes = emp.notes.trim();
  let msg = template
    .replace(/\{\{name\}\}/g, emp.name || '')
    .replace(/\{\{branch\}\}/g, cleanBranchDisplay(emp.branch) || '-')
    .replace(/\{\{startDate\}\}/g, formatThaiDate(emp.startDate))
    .replace(/\{\{salary\}\}/g, salaryText(emp.salary))
    .replace(/\{\{ta\}\}/g, emp.ta || '-')
    .replace(/\{\{phone\}\}/g, emp.phone || '-')
    .replace(/\{\{company\}\}/g, emp.company || '-')
    .replace(/\{\{mainUnit\}\}/g, emp.company || '-')
    .replace(/\{\{position\}\}/g, emp.position || '-')
    .replace(/\{\{notes\}\}/g, notes || '-');
  if (notes && !template.includes('{{notes}}')) msg = `${msg.replace(/\s+$/, '')}\n\nหมายเหตุเพิ่มเติม\n${notes}`;
  return msg;
}

/** สิ่งที่ยังขาดก่อนส่งแจ้งเตือนได้ */
export function missingOnboardFields(emp: OnboardEmployee): string[] {
  const out: string[] = [];
  if (!emp.startDate) out.push('วันที่เริ่มงาน');
  if (!emp.position.trim()) out.push('ตำแหน่ง');
  if (!emp.branch.trim()) out.push('สาขา');
  return out;
}

// ---------------------------------------------------------------------------
// การ์ด LINE (buildOnboardFlexBubble_ เดิม)

const URL_RE = /(https?:\/\/[^\s]+)/g;

function noteLines(text: string): FlexComponent[] {
  const contents: FlexComponent[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    for (const part of line.split(URL_RE)) {
      if (!part) continue;
      const margin = contents.length ? 'xs' : 'none';
      if (/^https?:\/\//i.test(part)) {
        const uri = part.replace(/[),.;]+$/g, '');
        contents.push({ type: 'text', text: uri, size: 'xs', color: '#2563EB', wrap: true, decoration: 'underline', action: { type: 'uri', label: 'เปิดลิงก์', uri }, margin });
      } else {
        contents.push({ type: 'text', text: part, size: 'xs', color: '#374151', wrap: true, margin });
      }
    }
  }
  return contents.length ? contents : [{ type: 'text', text: text || '-', size: 'xs', color: '#374151', wrap: true }];
}

const row = (label: string, value: string): FlexComponent => ({
  type: 'box',
  layout: 'baseline',
  spacing: 'sm',
  contents: [
    { type: 'text', text: label, size: 'sm', color: '#5F6E5C', flex: 2, wrap: true },
    { type: 'text', text: value || '-', size: 'sm', color: '#1E2A1C', weight: 'bold', flex: 3, wrap: true },
  ],
});

const noteBox = (text: string): FlexComponent => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: '#E8F5E9',
  cornerRadius: 'md',
  paddingAll: '12px',
  margin: 'sm',
  spacing: 'xs',
  contents: noteLines(text),
});

/** หมายเหตุมาตรฐานจากเทมเพลตที่เติมค่าแล้ว (ส่วนหลังหัวข้อ "หมายเหตุ" ไม่รวม "หมายเหตุเพิ่มเติม") */
function standardNotes(body: string): string {
  const before = body.split(/หมายเหตุเพิ่มเติม/)[0] ?? body;
  const idx = before.indexOf('หมายเหตุ');
  if (idx < 0) return '';
  return before
    .slice(idx)
    .replace(/^หมายเหตุ\s*\r?\n?/, '')
    .replace(/\n\s*หมายเหตุ\s*\r?\n/g, '\n')
    .trim();
}

export function buildOnboardBubble(emp: OnboardEmployee, body: string, templateColor: string, logoUrl: string | null): FlexBubble {
  // สีหัว/ปุ่มตามแบรนด์ — ใช้สีของเทมเพลตแทนได้ ยกเว้นเขียวเก่า (#059669) ตามพฤติกรรมจริงของระบบเดิม
  let color = '#47A838';
  let buttonColor = '#35872A';
  const c = templateColor.trim().toLowerCase();
  if (c && c !== '#059669') {
    color = templateColor.trim();
    buttonColor = color;
  }
  const extra = emp.notes.trim();
  const std = standardNotes(body);
  const link = `${std}\n${extra}`.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[),.;]+$/g, '') ?? '';
  const salary = emp.salary ? `${emp.salary.toLocaleString('th-TH')} บาท/เดือน` : '-';

  const bodyContents: FlexComponent[] = [
    { type: 'text', text: 'เอกสารของคุณครบถ้วนและอนุมัติเรียบร้อยแล้ว !', size: 'sm', color: '#5F6E5C', wrap: true },
    { type: 'text', text: 'กรุณาตรวจสอบข้อมูล', size: 'sm', color: '#5F6E5C', wrap: true, margin: 'xs' },
    { type: 'text', text: 'รายละเอียด', weight: 'bold', size: 'sm', color: '#1E2A1C', margin: 'lg' },
    row('วันที่เริ่มงาน', formatThaiDate(emp.startDate)),
    row('ชื่อ-นามสกุล', emp.name),
    row('ตำแหน่ง', emp.position),
    row('สาขา', cleanBranchDisplay(emp.branch)),
    row('เงินเดือน', salary),
  ];
  if (std) bodyContents.push({ type: 'text', text: 'หมายเหตุ', weight: 'bold', size: 'sm', color: '#1E2A1C', margin: 'lg' }, noteBox(std));
  if (extra) bodyContents.push({ type: 'text', text: 'หมายเหตุเพิ่มเติม', weight: 'bold', size: 'sm', color: '#1E2A1C', margin: 'lg' }, noteBox(extra));

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '0px',
      contents: [
        ...(logoUrl
          ? [
              {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#FFFFFF',
                paddingAll: '16px',
                contents: [{ type: 'image', url: logoUrl, size: 'xl', aspectRatio: '3:1', aspectMode: 'fit', align: 'center' }],
              },
            ]
          : []),
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: color,
          paddingAll: '16px',
          contents: [
            { type: 'text', text: 'ยืนยันข้อมูลการเริ่มงาน', weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
            { type: 'text', text: 'เอกสารครบและอนุมัติแล้ว', size: 'sm', color: '#FFFFFF', wrap: true, margin: 'xs' },
          ],
        },
        { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm', backgroundColor: '#FFFFFF', contents: bodyContents },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      paddingTop: '0px',
      contents: [
        link
          ? { type: 'button', style: 'primary', color: buttonColor, height: 'sm', action: { type: 'uri', label: 'เปิดลิงก์รหัสพนักงาน', uri: link } }
          : { type: 'button', style: 'primary', color: buttonColor, height: 'sm', action: { type: 'message', label: 'รับทราบ', text: 'รับทราบข้อมูลเริ่มงาน' } },
      ],
    },
  };
}
