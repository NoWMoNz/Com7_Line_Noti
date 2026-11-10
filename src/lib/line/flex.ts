/**
 * Flex Message ของ LINE — ย้ายดีไซน์มาจาก LineMessaging.gs / LineWebhook.gs ของระบบเดิม
 * โทนสี COM7: เขียวแบรนด์ #2F9A2A
 */
import type { FlexBubble, FlexComponent } from './types';

export const FLEX_THEME = {
  success: { color: '#2F9A2A', dark: '#1E7A1A', tint: '#E8F5E9', header: '#2F9A2A', button: '#35872A' },
  info: { color: '#2F6FD0', dark: '#1D4ED8', tint: '#EFF6FF', header: '#2F6FD0', button: '#2F6FD0' },
  warn: { color: '#E0A030', dark: '#B57A10', tint: '#FFF8E7', header: '#E0A030', button: '#E0A030' },
  danger: { color: '#D64545', dark: '#B91C1C', tint: '#FDECEC', header: '#D64545', button: '#D64545' },
  text: '#1E2A1C',
  sub: '#5F6E5C',
  border: '#E3EAE1',
  soft: '#E8F5E9',
  brand: '#2F9A2A',
} as const;

type Tone = 'success' | 'info' | 'warn' | 'danger';

export const DEFAULT_LOGO_URL = 'https://companieslogo.com/img/orig/COM7.BK_BIG-1d5f8726.png?t=1720244491';

function logoHeader(logoUrl: string | null): FlexComponent | null {
  if (!logoUrl) return null;
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#FFFFFF',
    paddingAll: '16px',
    contents: [{ type: 'image', url: logoUrl, size: 'xl', aspectRatio: '3:1', aspectMode: 'fit', align: 'center' }],
  };
}

export interface NotifyFlexOptions {
  tone: Tone;
  title: string;
  subtitle?: string;
  greeting?: string;
  note?: { label?: string; text: string; tone?: Tone };
  /** รายการแบบมีจุดนำหน้า เช่น ชื่อเอกสารที่ผ่าน/ต้องแก้ */
  list?: { title?: string; items: string[] };
  /** ปุ่มเปิดลิงก์ (uri) หรือปุ่มส่ง postback กลับเข้าแชท */
  button?: { label: string; uri?: string; postback?: { data: string; displayText?: string }; color?: string };
  headerColor?: string;
  logoUrl: string | null;
}

/** การ์ดแจ้งเตือนมาตรฐาน: โลโก้ + แถบหัวสี + เนื้อหา + ปุ่ม */
export function buildNotifyFlex(opts: NotifyFlexOptions): FlexBubble {
  const theme = FLEX_THEME[opts.tone];
  const body: FlexComponent[] = [];

  if (opts.greeting) {
    body.push({ type: 'text', text: opts.greeting, weight: 'bold', size: 'md', color: FLEX_THEME.text, wrap: true });
  }
  if (opts.list && opts.list.items.length > 0) {
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'xs',
      contents: [
        ...(opts.list.title
          ? [{ type: 'text', text: opts.list.title, size: 'xs', weight: 'bold', color: FLEX_THEME.sub }]
          : []),
        ...opts.list.items.map((item) => ({
          type: 'text',
          text: `• ${item}`,
          size: 'sm',
          color: FLEX_THEME.text,
          wrap: true,
        })),
      ],
    });
  }
  if (opts.note?.text) {
    const nt = FLEX_THEME[opts.note.tone ?? 'warn'];
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      spacing: 'xs',
      backgroundColor: nt.tint,
      cornerRadius: 'md',
      paddingAll: 'md',
      borderWidth: '1px',
      borderColor: nt.color + '55',
      contents: [
        { type: 'text', text: opts.note.label ?? 'หมายเหตุ', size: 'xs', weight: 'bold', color: nt.dark },
        { type: 'text', text: opts.note.text, size: 'sm', color: FLEX_THEME.text, wrap: true, margin: 'xs' },
      ],
    });
  }

  const titleBar: FlexComponent = {
    type: 'box',
    layout: 'vertical',
    backgroundColor: opts.headerColor ?? theme.header,
    paddingAll: '16px',
    contents: [
      { type: 'text', text: opts.title, weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
      ...(opts.subtitle
        ? [{ type: 'text', text: opts.subtitle, size: 'sm', color: '#FFFFFF', wrap: true, margin: 'xs' }]
        : []),
    ],
  };

  const logo = logoHeader(opts.logoUrl);
  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'none',
      paddingAll: '0px',
      contents: [
        ...(logo ? [logo] : []),
        titleBar,
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingAll: '16px',
          contents: body.length ? body : [{ type: 'filler' }],
        },
      ],
    },
  };

  if (opts.button) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      paddingTop: '0px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: opts.button.color ?? theme.button,
          height: 'sm',
          action: opts.button.postback
            ? {
                type: 'postback',
                label: opts.button.label,
                data: opts.button.postback.data,
                ...(opts.button.postback.displayText ? { displayText: opts.button.postback.displayText } : {}),
              }
            : { type: 'uri', label: opts.button.label, uri: opts.button.uri ?? '' },
        },
      ],
    };
  }
  return bubble;
}

export function buildRegistrationFlex(url: string, logoUrl: string | null): FlexBubble {
  return buildNotifyFlex({
    tone: 'success',
    title: 'ลงทะเบียนสมัครงาน',
    subtitle: 'ขั้นตอนแรกก่อนแนบเอกสาร',
    greeting: 'กรุณากรอกข้อมูลผ่านลิงก์ด้านล่าง',
    note: {
      label: '3 ขั้นตอน',
      text: 'ขั้น 1 กรอกข้อมูลลงทะเบียน\nขั้น 2 รอ HR อนุมัติ\nขั้น 3 แนบเอกสารผ่าน LINE',
      tone: 'success',
    },
    button: { label: 'กรอกข้อมูลลงทะเบียน', uri: url, color: '#35872A' },
    headerColor: '#47A838',
    logoUrl,
  });
}

export function buildPendingApprovalFlex(applicantName: string, logoUrl: string | null): FlexBubble {
  return buildNotifyFlex({
    tone: 'warn',
    title: 'รอการอนุมัติจากเจ้าหน้าที่',
    subtitle: 'สถานะปัจจุบัน',
    greeting: 'สวัสดีค่ะคุณ' + (applicantName || ''),
    note: {
      label: 'สถานะปัจจุบัน',
      text: 'เจ้าหน้าที่กำลังตรวจสอบข้อมูลการลงทะเบียนของคุณอยู่ เมื่ออนุมัติเรียบร้อยแล้ว ระบบจะส่งข้อความแจ้งกลับมาที่แชทนี้ทันที กรุณารอสักครู่นะคะ',
      tone: 'warn',
    },
    logoUrl,
  });
}

export function buildDocsCompleteFlex(applicantName: string, totalDocs: number, logoUrl: string | null): FlexBubble {
  const totalLabel = `${totalDocs}/${totalDocs} รายการ`;
  const logo = logoHeader(logoUrl);
  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '0px',
      contents: [
        ...(logo ? [logo] : []),
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: FLEX_THEME.success.header,
          paddingAll: '16px',
          contents: [
            { type: 'text', text: 'ส่งเอกสารครบถ้วนแล้ว', weight: 'bold', size: 'md', color: '#FFFFFF', wrap: true },
            { type: 'text', text: 'ขอบคุณสำหรับความร่วมมือค่ะ', size: 'sm', color: '#FFFFFF', wrap: true, margin: 'xs' },
          ],
        },
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              alignItems: 'center',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  width: '56px',
                  height: '56px',
                  cornerRadius: '28px',
                  backgroundColor: FLEX_THEME.soft,
                  justifyContent: 'center',
                  alignItems: 'center',
                  contents: [
                    {
                      type: 'box',
                      layout: 'vertical',
                      width: '38px',
                      height: '38px',
                      cornerRadius: '19px',
                      backgroundColor: FLEX_THEME.brand,
                      justifyContent: 'center',
                      alignItems: 'center',
                      contents: [{ type: 'text', text: '✓', size: 'lg', color: '#FFFFFF', weight: 'bold', align: 'center' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'text',
              text: applicantName ? 'คุณ' + applicantName : 'สวัสดีค่ะ',
              weight: 'bold',
              size: 'lg',
              color: FLEX_THEME.text,
              align: 'center',
              margin: 'lg',
              wrap: true,
            },
            {
              type: 'text',
              text: 'ระบบได้รับเอกสารครบทุกรายการแล้ว\nเจ้าหน้าที่กำลังตรวจสอบให้คุณอยู่',
              size: 'sm',
              color: FLEX_THEME.sub,
              wrap: true,
              align: 'center',
              margin: 'sm',
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#F9FAFB',
              cornerRadius: 'lg',
              paddingAll: '14px',
              margin: 'lg',
              borderWidth: '1px',
              borderColor: FLEX_THEME.border,
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'ความคืบหน้า', size: 'xs', color: FLEX_THEME.sub, flex: 1 },
                    { type: 'text', text: totalLabel, size: 'xs', weight: 'bold', color: FLEX_THEME.brand },
                  ],
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  height: '8px',
                  backgroundColor: FLEX_THEME.soft,
                  cornerRadius: 'md',
                  margin: 'md',
                  contents: [
                    {
                      type: 'box',
                      layout: 'vertical',
                      height: '8px',
                      width: '100%',
                      backgroundColor: FLEX_THEME.brand,
                      cornerRadius: 'md',
                      contents: [{ type: 'filler' }],
                    },
                  ],
                },
                { type: 'text', text: 'เอกสารครบ 100%', size: 'xxs', color: FLEX_THEME.brand, weight: 'bold', align: 'end', margin: 'sm' },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: FLEX_THEME.warn.tint,
              cornerRadius: 'lg',
              paddingAll: '14px',
              margin: 'lg',
              borderWidth: '1px',
              borderColor: '#FDE68A',
              contents: [
                { type: 'text', text: 'ขั้นตอนถัดไป', size: 'xs', weight: 'bold', color: FLEX_THEME.warn.dark },
                {
                  type: 'text',
                  text: 'HR จะตรวจสอบเอกสารและแจ้งผลกลับทาง LINE ภายใน 1–2 วันทำการ ไม่ต้องส่งซ้ำค่ะ',
                  size: 'sm',
                  color: FLEX_THEME.text,
                  wrap: true,
                  margin: 'xs',
                },
              ],
            },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      paddingTop: '0px',
      contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: 'ดูสถานะอีกครั้ง', text: 'สถานะ' } },
      ],
    },
  };
}

/** ปุ่มเปิดหน้าส่งเอกสาร (MINI App) พร้อมสรุปสถานะ — ใช้ตอบ「เมนู / สถานะ」และเมื่อผู้สมัครส่งรูปเข้ามาในแชท */
export function buildOpenAppFlex(opts: {
  title: string;
  greeting: string;
  items?: string[];
  note?: string;
  url: string;
  logoUrl: string | null;
}): FlexBubble {
  const items = opts.items ?? [];
  return buildNotifyFlex({
    tone: 'info',
    title: opts.title,
    greeting: opts.greeting,
    list: items.length
      ? { title: 'รายการที่ยังต้องดำเนินการ', items: items.length > 10 ? [...items.slice(0, 10), `และอีก ${items.length - 10} รายการ`] : items }
      : undefined,
    note: opts.note ? { label: 'หมายเหตุ', text: opts.note, tone: 'info' } : undefined,
    button: { label: 'เปิดหน้าส่งเอกสาร', uri: opts.url },
    logoUrl: opts.logoUrl,
  });
}
