/**
 * Logic การสนทนาของ LINE OA — ย้ายมาจาก handleLineEvent_ (LineWebhook.gs) โดยคงพฤติกรรมเดิม:
 *
 *  - พิมพ์「ลงทะเบียนยืนยันตัวตน」→ ส่งลิงก์ลงทะเบียน (สร้างผู้สมัครใหม่ถ้ายังไม่มี)
 *  - พิมพ์「สถานะ / ตรวจสอบ / อัปโหลด / เมนู」→ สรุป X จาก Y + carousel เอกสารที่ยังขาด/ตีกลับ
 *  - postback select_doc / select_subitem → จำว่ากำลังรอไฟล์ของเอกสารไหน (10 นาที)
 *  - ส่งรูป/PDF → บันทึกเป็นเอกสารที่เลือกไว้ แล้วตอบยืนยัน + แจ้งเมื่อครบ
 *  - คนที่ยังไม่มีบัญชี / ยังไม่เลือกเอกสาร → เงียบ ไม่ตอบ (ตาม requirement เดิม)
 *
 * แก้จากระบบเดิม:
 *  - ไฟล์จากแชทของเอกสารหลายหน้าถูกนับครบถูกต้อง (เดิม prefix "application::" ไม่ตรงกับที่ Dashboard ค้นหา)
 *  - ใช้กฎสถานะชุดเดียวกับทุกหน้า (lib/docs/status.ts)
 *  - ขยายขนาดไฟล์สูงสุดจาก 2 MB (ข้อจำกัดของ Apps Script) เป็นค่าที่ตั้งได้
 */
import { requiredDocsFor, summarizeApplicantDocs, type ApplicantDocSummary } from '@/lib/docs/status';
import type { Applicant, DocType } from '@/lib/docs/types';
import type { Repo } from '@/lib/repo/types';
import {
  buildDocDetail,
  buildDocMenuCarousel,
  buildDocsCompleteFlex,
  buildPendingApprovalFlex,
  buildRegistrationFlex,
  buildSubitemMenu,
} from './flex';
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

const PENDING_TTL_SECONDS = 600;
const REGISTER_RE = /ลงทะเบียน\s*ยืนยันตัวตน/;
const MENU_RE = /สถานะ|ตรวจสอบ|อัปโหลด|เมนู/;
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

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
 * ลิงก์ส่วนตัวของผู้สมัคร
 * - มี LIFF ID ของ LINE MINI App → https://miniapp.line.me/{liffId}?token=...
 *   (Endpoint URL ของ MINI App ตั้งเป็น https://<โดเมน>/apply LINE จะเปิดหน้านั้นพร้อม query เดิม)
 * - ไม่มี → เปิดหน้าเว็บตรงๆ (ใช้ตอน dev นอก LINE)
 */
export function buildPersonalLink(config: HandlerConfig, token: string): string {
  if (config.liffId) return `https://miniapp.line.me/${config.liffId}?token=${encodeURIComponent(token)}`;
  return `${config.appBaseUrl.replace(/\/$/, '')}/apply?token=${encodeURIComponent(token)}`;
}

export async function handleLineEvent(event: LineEvent, deps: HandlerDeps): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  const replyToken = event.replyToken ?? '';

  if (event.type === 'message' && event.message?.type === 'text') {
    const msg = (event.message.text ?? '').trim();
    if (REGISTER_RE.test(msg)) return replyRegistrationLink(replyToken, lineUserId, deps);
    if (MENU_RE.test(msg)) return replyDocMenu(replyToken, lineUserId, deps);
    return;
  }

  if (event.type === 'postback' && event.postback) {
    return handlePostback(replyToken, lineUserId, parseQuery(event.postback.data), deps);
  }

  if (event.type === 'message' && (event.message?.type === 'image' || event.message?.type === 'file')) {
    return handleIncomingFile(replyToken, lineUserId, event.message.id, deps);
  }
  // follow / unfollow / อื่นๆ → ไม่ตอบ (ตามระบบเดิม)
}

// ---------------------------------------------------------------------------

interface ApplicantContext {
  applicant: Applicant;
  allDocs: DocType[];
  summary: ApplicantDocSummary;
}

async function loadContext(applicant: Applicant, repo: Repo): Promise<ApplicantContext> {
  const [allDocs, state] = await Promise.all([repo.getDocTypes(), repo.getDocState(applicant.id)]);
  const docs = requiredDocsFor(applicant.requiredDocKeys, allDocs);
  return { applicant, allDocs, summary: summarizeApplicantDocs(docs, state.files, state.reviews) };
}

async function replyRegistrationLink(replyToken: string, lineUserId: string, deps: HandlerDeps) {
  const { repo, line, config } = deps;
  let applicant = await repo.findApplicantByLineId(lineUserId);
  if (!applicant) {
    applicant = await repo.createApplicantForLine(lineUserId);
  } else if (applicant.approved) {
    await line.reply(replyToken, [
      text(
        (applicant.name ? `คุณ${applicant.name} ` : '') +
          'ลงทะเบียนและได้รับการอนุมัติแล้วค่ะ\nพิมพ์「เมนู」หรือ「สถานะ」เพื่อแนบเอกสารได้เลย',
      ),
    ]);
    return;
  }
  const url = buildPersonalLink(config, applicant.accessToken);
  await line.reply(replyToken, [
    { type: 'flex', altText: 'ลิงก์ลงทะเบียนสมัครงาน', contents: buildRegistrationFlex(url, config.logoUrl) },
  ]);
}

async function replyDocMenu(replyToken: string, lineUserId: string, deps: HandlerDeps) {
  const { repo, line, config } = deps;
  const applicant = await repo.findApplicantByLineId(lineUserId);
  if (!applicant) return; // ยังไม่ลงทะเบียน → เงียบ
  if (!applicant.approved) {
    await line.reply(replyToken, [
      text('บัญชีของคุณยังไม่ได้รับการอนุมัติจากเจ้าหน้าที่ กรุณารอการอนุมัติก่อนแนบเอกสารนะครับ'),
    ]);
    return;
  }

  const { summary } = await loadContext(applicant, repo);
  if (summary.allSatisfied) {
    await line.reply(replyToken, [
      {
        type: 'flex',
        altText: 'ส่งเอกสารครบถ้วนแล้ว — ขอบคุณสำหรับความร่วมมือค่ะ',
        contents: buildDocsCompleteFlex(applicant.name, summary.total, config.logoUrl),
      },
    ]);
    return;
  }

  const remaining = summary.actionable.length;
  await line.reply(replyToken, [
    text(
      `📋 สถานะเอกสารของคุณ\nส่งแล้ว ${summary.satisfiedCount} จาก ${summary.total} รายการ (เหลืออีก ${remaining} รายการ)\n\nกรุณาเลือกรายการที่ต้องการแนบด้านล่างนี้ค่ะ`,
    ),
    {
      type: 'flex',
      altText: `เลือกเอกสารที่ต้องการแนบ (${remaining} รายการ)`,
      contents: buildDocMenuCarousel(summary.actionable, summary.docs),
    },
  ]);
}

async function handlePostback(
  replyToken: string,
  lineUserId: string,
  data: Record<string, string>,
  deps: HandlerDeps,
) {
  const { repo, line, config } = deps;

  if (data.action === 'open_menu') return replyDocMenu(replyToken, lineUserId, deps);

  const applicant = await repo.findApplicantByLineId(lineUserId);
  if (!applicant) return; // ยังไม่มีบัญชี → เงียบ

  if (data.action === 'select_doc' || data.action === 'select_subitem' || data.action === 'view_detail') {
    if (!applicant.approved) {
      await line.reply(replyToken, [
        {
          type: 'flex',
          altText: 'บัญชีของคุณยังไม่ได้รับการอนุมัติ',
          contents: buildPendingApprovalFlex(applicant.name, config.logoUrl),
        },
      ]);
      return;
    }

    const ctx = await loadContext(applicant, repo);
    const status = ctx.summary.docs.find((s) => s.doc.key === data.docKey);
    const doc = status?.doc ?? ctx.allDocs.find((d) => d.key === data.docKey && d.enabled);
    if (!doc) {
      await line.reply(replyToken, [
        text('ไม่พบประเภทเอกสารนี้ในระบบ หรือถูกปิดการใช้งานแล้ว กรุณาพิมพ์「เมนู」เพื่อเลือกใหม่อีกครั้ง'),
      ]);
      return;
    }

    if (data.action === 'view_detail') {
      if (status) {
        await line.reply(replyToken, [
          { type: 'flex', altText: `${doc.label} - รายละเอียด`, contents: buildDocDetail(status) },
        ]);
      }
      return;
    }

    if (data.action === 'select_doc' && status && doc.subitems.length > 0) {
      await line.reply(replyToken, [
        { type: 'flex', altText: `${doc.label} — เลือกไฟล์ย่อย`, contents: buildSubitemMenu(status) },
      ]);
      return;
    }

    let subitemTitle = '';
    if (data.action === 'select_subitem') {
      const sub = doc.subitems.find((s) => s.title === data.subTitle);
      if (!sub) {
        await line.reply(replyToken, [text('ไม่พบหัวข้อนี้ในเอกสาร กรุณาพิมพ์「เมนู」เพื่อเลือกใหม่อีกครั้ง')]);
        return;
      }
      subitemTitle = sub.title;
    }

    await repo.setPendingUpload(lineUserId, { docKey: doc.key, subitemTitle }, PENDING_TTL_SECONDS);
    await line.reply(replyToken, [
      text(`กรุณาส่งรูปภาพ หรือไฟล์ PDF ของ "${subitemTitle || doc.label}" เข้ามาในแชทนี้ได้เลยค่ะ`),
    ]);
  }
}

async function handleIncomingFile(replyToken: string, lineUserId: string, messageId: string, deps: HandlerDeps) {
  const { repo, line, config } = deps;

  // เช็คบัญชีก่อนเป็นอย่างแรก — คนที่ยังไม่มีบัญชีส่งรูปมา → เงียบ
  const applicant = await repo.findApplicantByLineId(lineUserId);
  if (!applicant) return;
  const pending = await repo.getPendingUpload(lineUserId);
  if (!pending) return; // ยังไม่ได้เลือกเอกสารจากเมนู → เงียบ
  if (!applicant.approved) return;

  const allDocs = await repo.getDocTypes();
  const doc = allDocs.find((d) => d.key === pending.docKey && d.enabled);
  if (!doc) {
    await repo.clearPendingUpload(lineUserId);
    await line.reply(replyToken, [
      text('เอกสารประเภทนี้ปิดรับการอัปโหลดผ่านแชทแล้วค่ะ กรุณาพิมพ์ "เมนู" เพื่อเลือกเอกสารใหม่'),
    ]);
    return;
  }

  const content = await line.getContent(messageId);
  if (!content) {
    await line.reply(replyToken, [text('ขออภัยค่ะ ระบบรับไฟล์ไม่สำเร็จ กรุณาส่งรูป/ไฟล์อีกครั้งนะคะ')]);
    return;
  }
  const mimeType = content.contentType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIME[mimeType]) {
    await line.reply(replyToken, [text('รองรับเฉพาะรูปภาพ (JPG, PNG, WEBP) หรือไฟล์ PDF เท่านั้นค่ะ')]);
    return;
  }
  if (content.bytes.length > config.maxUploadBytes) {
    const mb = Math.round(config.maxUploadBytes / 1024 / 1024);
    await line.reply(replyToken, [
      text(`ไฟล์มีขนาดใหญ่เกิน ${mb} MB ค่ะ กรุณาลดขนาดไฟล์แล้วส่งใหม่อีกครั้งนะคะ`),
    ]);
    return;
  }

  await repo.saveUploadedFile({
    applicant,
    docKey: doc.key,
    subitemTitle: pending.subitemTitle,
    bytes: content.bytes,
    mimeType,
    source: 'line',
  });
  await repo.clearPendingUpload(lineUserId);

  const doneLabel = pending.subitemTitle ? `${doc.label} - ${pending.subitemTitle}` : doc.label;
  await repo.logActivity({
    actor: applicant.name || 'Applicant',
    action: 'อัปโหลดผ่าน LINE',
    targetId: applicant.code,
    targetName: applicant.name,
    detail: `${doneLabel} (${Math.round(content.bytes.length / 1024)} KB)`,
  });

  const { summary } = await loadContext(applicant, repo);
  const remaining = summary.actionable.length;
  await line.reply(replyToken, [
    text(
      `ระบบได้รับ "${doneLabel}" เรียบร้อยแล้วค่ะ รอเจ้าหน้าที่ตรวจสอบ\n` +
        (remaining > 0
          ? `เหลืออีก ${remaining} รายการ พิมพ์ "เมนู" เพื่อดูรายการที่ยังขาดค่ะ`
          : 'คุณส่งเอกสารครบทุกรายการแล้วค่ะ'),
    ),
  ]);

  if (remaining === 0 && applicant.lineUserId) {
    const ok = await line.push(applicant.lineUserId, [
      {
        type: 'flex',
        altText: `คุณ${applicant.name} ส่งเอกสารครบถ้วนแล้ว`,
        contents: buildDocsCompleteFlex(applicant.name, summary.total, config.logoUrl),
      },
    ]);
    await repo.logNotification({
      type: 'docs_complete',
      applicant,
      status: ok ? 'ok' : 'error',
      messagePreview: 'ส่งเอกสารครบถ้วนแล้ว',
      error: ok ? undefined : 'push failed',
    });
  }
}
