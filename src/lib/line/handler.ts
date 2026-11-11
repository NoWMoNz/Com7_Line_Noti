/**
 * การสนทนาของ LINE OA — แชทมีหน้าที่แค่ "ชี้ทาง" ไปหน้าส่งเอกสาร (LINE MINI App)
 *
 *  - 「ลงทะเบียน ยืนยันตัวตน」→ การ์ดเปิดหน้าลงทะเบียน (หรือแจ้งว่าอนุมัติแล้ว / รออนุมัติ)
 *  - 「สถานะ / ตรวจสอบ / อัปโหลด / เมนู」→ สรุปส่งแล้ว X จาก Y + รายการที่ยังขาด + ปุ่มเปิดหน้าส่งเอกสาร
 *  - ผู้สมัครส่งรูป/ไฟล์เข้ามาในแชท → แจ้งให้ส่งผ่านหน้าส่งเอกสาร (ไม่รับไฟล์ทางแชทแล้ว)
 *  - คนที่ยังไม่มีบัญชีส่งรูป / ข้อความอื่น → เงียบ
 *
 * ต่างจากระบบเดิม (LineWebhook.gs):
 *  - เลิกรับเอกสารทางแชท — เดิมต้องเลือกเมนู 2 ชั้นแล้วส่งรูปภายใน 10 นาที ส่งผิดช่องง่าย
 *  - กด「ลงทะเบียน」ไม่สร้างแถวผู้สมัครเปล่าอีก — สร้างตอนกรอกฟอร์มในหน้าลงทะเบียนเสร็จ
 *  - ลิงก์ไม่แนบ token — หน้าส่งเอกสารรู้ว่าเป็นใครจากบัญชี LINE (ตรวจ ID token กับ LINE)
 */
import { requiredDocsFor, summarizeApplicantDocs } from '@/lib/docs/status';
import type { Applicant } from '@/lib/docs/types';
import type { Repo } from '@/lib/repo/types';
import { buildDocsCompleteFlex, buildOpenAppFlex, buildPendingApprovalFlex, buildRegistrationFlex } from './flex';
import type { LineApi, LineEvent, LineMessage } from './types';

export interface HandlerConfig {
  liffId: string;
  appBaseUrl: string;
  logoUrl: string | null;
  maxUploadBytes: number;
}

export interface HandlerDeps {
  repo: Repo;
  line: LineApi;
  config: HandlerConfig;
}

const REGISTER_RE = /ลงทะเบียน\s*ยืนยันตัวตน/;
const MENU_RE = /สถานะ|ตรวจสอบ|อัปโหลด|เมนู/;

const text = (t: string): LineMessage => ({ type: 'text', text: t });

export function parseQuery(str: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (str || '').split('&')) {
    const idx = pair.indexOf('=');
    const k = idx === -1 ? pair : pair.slice(0, idx);
    const v = idx === -1 ? '' : pair.slice(idx + 1);
    if (!k) continue;
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/**
 * ลิงก์หน้าส่งเอกสาร
 * - มี LIFF ID → https://miniapp.line.me/{liffId} (+ ?doc= เปิดเอกสารนั้นทันที / ?token= สำหรับลิงก์ส่วนตัว)
 *   Endpoint URL ของ MINI App ตั้งเป็น https://<โดเมน>/apply — LINE เปิดหน้านั้นพร้อม query เดิม
 * - ไม่มี → เปิดหน้าเว็บตรงๆ (ใช้ตอน dev นอก LINE)
 */
export function buildAppLink(config: HandlerConfig, opts: { token?: string | null; doc?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.token) q.set('token', opts.token);
  if (opts.doc) q.set('doc', opts.doc);
  const qs = q.toString() ? `?${q}` : '';
  if (config.liffId) return `https://miniapp.line.me/${config.liffId}${qs}`;
  return `${config.appBaseUrl.replace(/\/$/, '')}/apply${qs}`;
}

/** ลิงก์ส่วนตัว (มี token) — ใช้กับคนที่เปิดนอก LINE เช่น ผ่านคอมพิวเตอร์ */
export function buildPersonalLink(config: HandlerConfig, token: string): string {
  return buildAppLink(config, { token });
}

const profileComplete = (a: Applicant) => !!a.name.trim() && !!(a.phone ?? '').trim();

export async function handleLineEvent(event: LineEvent, deps: HandlerDeps): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  const replyToken = event.replyToken ?? '';

  if (event.type === 'message' && event.message?.type === 'text') {
    const msg = (event.message.text ?? '').trim();
    if (REGISTER_RE.test(msg)) return replyRegistration(replyToken, lineUserId, deps);
    if (MENU_RE.test(msg)) return replyStatus(replyToken, lineUserId, deps);
    return;
  }

  // การ์ดเก่าในแชท (ระบบเดิม) มีปุ่ม postback open_menu / select_doc → ตอบสถานะ + ปุ่มเปิดหน้าส่งเอกสาร
  if (event.type === 'postback' && event.postback) {
    const action = parseQuery(event.postback.data).action;
    if (action === 'open_menu' || action === 'select_doc' || action === 'select_subitem' || action === 'view_detail') {
      return replyStatus(replyToken, lineUserId, deps);
    }
    return;
  }

  if (event.type === 'message' && (event.message?.type === 'image' || event.message?.type === 'file')) {
    const applicant = await deps.repo.findApplicantByLineId(lineUserId);
    if (!applicant) return; // ยังไม่มีบัญชี → เงียบ
    await deps.line.reply(replyToken, [
      {
        type: 'flex',
        altText: 'กรุณาส่งเอกสารผ่านหน้าส่งเอกสาร',
        contents: buildOpenAppFlex({
          title: 'ส่งเอกสารผ่านหน้าส่งเอกสาร',
          greeting: 'ระบบไม่รับเอกสารทางแชทแล้วค่ะ',
          note: 'กดปุ่มด้านล่าง แล้วเลือกเอกสารที่ต้องการส่ง ถ่ายรูปหรือแนบไฟล์ได้เลย ระบบจะบันทึกให้ตรงช่อง',
          url: buildAppLink(deps.config),
          logoUrl: deps.config.logoUrl,
        }),
      },
    ]);
  }
  // follow / unfollow / อื่นๆ → ไม่ตอบ (ตามระบบเดิม)
}

async function replyRegistration(replyToken: string, lineUserId: string, deps: HandlerDeps) {
  const { repo, line, config } = deps;
  const applicant = await repo.findApplicantByLineId(lineUserId);
  if (applicant?.approved) {
    await line.reply(replyToken, [
      text((applicant.name ? `คุณ${applicant.name} ` : '') + 'ลงทะเบียนและได้รับการอนุมัติแล้วค่ะ\nพิมพ์「สถานะ」เพื่อดูเอกสารที่ยังต้องส่ง'),
    ]);
    return;
  }
  if (applicant && profileComplete(applicant)) {
    await line.reply(replyToken, [
      { type: 'flex', altText: 'บัญชีของคุณรอการอนุมัติ', contents: buildPendingApprovalFlex(applicant.name, config.logoUrl) },
    ]);
    return;
  }
  // ยังไม่ลงทะเบียน (หรือกรอกไม่ครบ) → ไปหน้าลงทะเบียน ไม่สร้างข้อมูลจนกว่าจะกรอกเสร็จ
  await line.reply(replyToken, [
    { type: 'flex', altText: 'ลิงก์ลงทะเบียนสมัครงาน', contents: buildRegistrationFlex(buildAppLink(config), config.logoUrl) },
  ]);
}

async function replyStatus(replyToken: string, lineUserId: string, deps: HandlerDeps) {
  const { repo, line, config } = deps;
  const applicant = await repo.findApplicantByLineId(lineUserId);
  if (!applicant || !profileComplete(applicant)) return replyRegistration(replyToken, lineUserId, deps);
  if (!applicant.approved) {
    await line.reply(replyToken, [
      { type: 'flex', altText: 'บัญชีของคุณรอการอนุมัติ', contents: buildPendingApprovalFlex(applicant.name, config.logoUrl) },
    ]);
    return;
  }

  const [allDocs, state] = await Promise.all([repo.getDocTypes(), repo.getDocState(applicant.id)]);
  const summary = summarizeApplicantDocs(requiredDocsFor(applicant.requiredDocKeys, allDocs, applicant.docScope), state.files, state.reviews);
  if (summary.allSatisfied || applicant.onboardNotified) {
    await line.reply(replyToken, [
      {
        type: 'flex',
        altText: 'ส่งเอกสารครบถ้วนแล้ว — ขอบคุณสำหรับความร่วมมือค่ะ',
        contents: buildDocsCompleteFlex(applicant.name, summary.total, config.logoUrl),
      },
    ]);
    return;
  }

  const items = summary.actionable.map((s) => (s.state === 'rejected' ? `${s.doc.label} (ต้องแก้ไข)` : s.doc.label));
  await line.reply(replyToken, [
    {
      type: 'flex',
      altText: `ส่งแล้ว ${summary.satisfiedCount} จาก ${summary.total} รายการ`,
      contents: buildOpenAppFlex({
        title: 'สถานะเอกสารของคุณ',
        greeting: `ส่งแล้ว ${summary.satisfiedCount} จาก ${summary.total} รายการ`,
        items,
        url: buildAppLink(config),
        logoUrl: config.logoUrl,
      }),
    },
  ]);
}
