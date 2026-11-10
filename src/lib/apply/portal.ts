/**
 * Logic ของหน้าผู้สมัคร (/apply) — แทน ApplicantPortal.gs + Pdpa.gs ของระบบเดิม
 *
 * ตัวตนของผู้ใช้:
 *  - token ในลิงก์ส่วนตัว = กุญแจเข้าถึงข้อมูลของผู้สมัครคนนั้น (เหมือนระบบเดิม)
 *  - lineUserId ที่ส่งเข้ามาที่นี่ต้องผ่านการตรวจ ID token กับ LINE มาแล้วเท่านั้น (ดู line/id-token.ts)
 *
 * สิ่งที่ต่างจากระบบเดิมโดยตั้งใจ (ช่องโหว่):
 *  - ระบบเดิม "ค้นหาด้วยเบอร์โทร" แล้วผูก LINE ใหม่ให้ทันที → ใครรู้เบอร์ก็ยึดบัญชีคนอื่นได้
 *    ระบบใหม่ผูกด้วยเบอร์ได้เฉพาะแถวที่ยังไม่มี LINE และต้องเปิดจาก LINE (มี lineUserId ที่ตรวจแล้ว)
 *  - ลงทะเบียนนอก LINE ด้วยเบอร์ที่มีในระบบแล้ว ระบบเดิมคืน token ของแถวนั้นให้ → ระบบใหม่ปฏิเสธ
 */
import { requiredDocsFor, summarizeApplicantDocs, type DocStatus } from '@/lib/docs/status';
import type { Applicant, DocReview, DocType, FileSlotRef } from '@/lib/docs/types';
import { buildDocsCompleteFlex, buildNotifyFlex } from '@/lib/line/flex';
import { buildPersonalLink, type HandlerConfig } from '@/lib/line/handler';
import type { LineApi } from '@/lib/line/types';
import type { Repo } from '@/lib/repo/types';
import { PDPA_VERSION } from './pdpa';
import type { ApplyErrorCode, ApplyState, DocItemView, DocsView } from './types';

export interface PortalDeps {
  repo: Repo;
  line: LineApi;
  config: HandlerConfig;
}

export class PortalError extends Error {
  constructor(
    public code: ApplyErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_FILES_PER_UPLOAD = 10;
export const ALLOWED_UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

const MSG = {
  linkInvalid: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาเปิดลิงก์ล่าสุดจากแชท LINE',
  lineMismatch:
    'ลิงก์นี้ผูกกับบัญชี LINE อื่นแล้ว กรุณาเปิดจาก LINE ของคุณเอง หากเปลี่ยนบัญชี LINE กรุณาติดต่อเจ้าหน้าที่',
  phoneOtherLine: 'เบอร์โทรนี้เคยลงทะเบียนไว้กับบัญชี LINE อื่นแล้ว หากเปลี่ยนบัญชี LINE กรุณาติดต่อเจ้าหน้าที่',
  phoneExistsWeb:
    'เบอร์โทรนี้มีในระบบแล้ว กรุณาเปิดหน้านี้จาก LINE หรือใช้ลิงก์ส่วนตัวที่ได้รับทางแชท LINE',
};

// ---------------------------------------------------------------------------
// ตรวจข้อมูลที่กรอก

export function normalizeName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateRegistration(name: string, phone: string, pdpaAccepted: unknown): void {
  if (!name || !phone) throw new PortalError('invalid_input', 'กรุณากรอกชื่อและเบอร์โทรศัพท์ให้ครบถ้วน');
  if (name.length < 3 || name.length > 120) throw new PortalError('invalid_input', 'กรุณากรอกชื่อ-นามสกุลให้ถูกต้อง');
  if (!/^0\d{9}$/.test(phone)) {
    throw new PortalError('invalid_input', 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก และต้องขึ้นต้นด้วย 0');
  }
  if (pdpaAccepted !== true) {
    throw new PortalError(
      'invalid_input',
      'กรุณายินยอมให้เก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคล (PDPA) ก่อนดำเนินการต่อ',
    );
  }
}

/** ชนิดไฟล์จาก byte แรกของไฟล์ — ไม่เชื่อ Content-Type ที่ browser ส่งมา */
export function sniffMime(bytes: Uint8Array): (typeof ALLOWED_UPLOAD_MIME)[number] | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (b.length >= 5 && String.fromCharCode(b[0], b[1], b[2], b[3], b[4]) === '%PDF-') return 'application/pdf';
  return null;
}

// ---------------------------------------------------------------------------
// สถานะที่ส่งให้หน้าเว็บ

const isProfileComplete = (a: Applicant) => !!a.name.trim() && !!(a.phone ?? '').trim();
const isPdpaAccepted = (a: Applicant) => !!a.pdpaAcceptedAt && a.pdpaVersion === PDPA_VERSION;

function toItemView(s: DocStatus): DocItemView {
  return {
    key: s.doc.key,
    label: s.doc.label,
    description: s.doc.description,
    state: s.state,
    reason: s.reason,
    subitems: s.subitems.map((x) => ({ title: x.title, optional: x.optional, state: x.state, reason: x.reason })),
    subDone: s.subDone,
    subRequired: s.subRequired,
  };
}

/** สถานะของเอกสารที่ไม่นับในความครบถ้วน (ไฟล์รวม / ไม่บังคับ) — ใช้กฎเดียวกัน แต่คิดแยกชุด */
function looseItemView(doc: DocType, files: FileSlotRef[], reviews: DocReview[]): DocItemView {
  const [status] = summarizeApplicantDocs([{ ...doc, optional: false, coversAll: false }], files, reviews).docs;
  return toItemView(status);
}

export function buildDocsView(
  applicant: Applicant,
  allDocs: DocType[],
  files: FileSlotRef[],
  reviews: DocReview[],
): DocsView {
  const docs = requiredDocsFor(applicant.requiredDocKeys, allDocs);
  const summary = summarizeApplicantDocs(docs, files, reviews);
  const allInOneDoc = docs.find((d) => d.coversAll);
  const optionalDocs = docs.filter((d) => d.optional && !d.coversAll);

  const view: DocsView = {
    total: summary.total,
    satisfiedCount: summary.satisfiedCount,
    allSatisfied: summary.allSatisfied,
    complete: summary.complete,
    allInOne: allInOneDoc ? looseItemView(allInOneDoc, files, reviews) : null,
    required: summary.docs.map(toItemView),
    optional: optionalDocs.map((d) => looseItemView(d, files, reviews)),
  };

  // แจ้งเริ่มงานแล้ว → ถือว่าครบและอนุมัติทั้งหมด (เหมือนระบบเดิม)
  if (applicant.onboardNotified) {
    view.complete = true;
    view.allSatisfied = true;
    view.satisfiedCount = view.total;
    view.required = view.required.map((d) => ({
      ...d,
      state: 'approved',
      reason: '',
      subitems: d.subitems.map((s) => ({ ...s, state: 'approved', reason: '' })),
      subDone: d.subRequired,
    }));
  }
  return view;
}

export async function buildState(applicant: Applicant, deps: PortalDeps): Promise<ApplyState> {
  const base: ApplyState = {
    screen: 'register',
    token: applicant.accessToken,
    personalLink: buildPersonalLink(deps.config, applicant.accessToken),
    name: applicant.name,
    phone: applicant.phone ?? '',
    feedback: applicant.adminFeedback.trim(),
    maxUploadMb: Math.round(deps.config.maxUploadBytes / 1024 / 1024),
    docs: null,
  };
  if (!isProfileComplete(applicant)) return base;
  if (!isPdpaAccepted(applicant)) return { ...base, screen: 'pdpa' };
  if (!applicant.approved) return { ...base, screen: 'pending' };

  const [allDocs, st] = await Promise.all([deps.repo.getDocTypes(), deps.repo.getDocState(applicant.id)]);
  return { ...base, screen: 'docs', docs: buildDocsView(applicant, allDocs, st.files, st.reviews) };
}

export function emptyState(deps: PortalDeps): ApplyState {
  return {
    screen: 'register',
    token: null,
    personalLink: null,
    name: '',
    phone: '',
    feedback: '',
    maxUploadMb: Math.round(deps.config.maxUploadBytes / 1024 / 1024),
    docs: null,
  };
}

// ---------------------------------------------------------------------------
// เปิดหน้า

/**
 * หาผู้สมัครจาก LINE ที่ตรวจแล้ว หรือ token ในลิงก์ (ลำดับเดียวกับ applicant_checkSelfRegister เดิม)
 * - บัญชี LINE นี้มีผู้สมัครอยู่แล้ว → ใช้คนนั้น
 * - token ผูกกับ LINE อื่น → ปฏิเสธ
 * - token ยังไม่ผูก LINE และเปิดจาก LINE → ผูกให้
 * คืน null = ยังไม่มีบัญชี (ให้ลงทะเบียน)
 */
export async function resolveApplicant(
  input: { token: string | null; lineUserId: string | null },
  deps: PortalDeps,
): Promise<Applicant | null> {
  const { repo } = deps;
  if (input.lineUserId) {
    const byLine = await repo.findApplicantByLineId(input.lineUserId);
    if (byLine) return byLine;
  }
  if (!input.token) return null;

  const byToken = await repo.findApplicantByToken(input.token);
  if (!byToken) return null;
  if (byToken.lineUserId && input.lineUserId && byToken.lineUserId !== input.lineUserId) {
    throw new PortalError('line_mismatch', MSG.lineMismatch);
  }
  if (!byToken.lineUserId && input.lineUserId) {
    return repo.updateApplicant(byToken.id, { bindLineUserId: input.lineUserId });
  }
  return byToken;
}

export async function openSession(
  input: { token: string | null; lineUserId: string | null },
  deps: PortalDeps,
): Promise<ApplyState> {
  const applicant = await resolveApplicant(input, deps);
  return applicant ? buildState(applicant, deps) : emptyState(deps);
}

async function requireByToken(token: string | null, deps: PortalDeps): Promise<Applicant> {
  const applicant = token ? await deps.repo.findApplicantByToken(token) : null;
  if (!applicant) throw new PortalError('not_found', MSG.linkInvalid);
  return applicant;
}

// ---------------------------------------------------------------------------
// ลงทะเบียน / PDPA

export async function register(
  input: { token: string | null; lineUserId: string | null; name: unknown; phone: unknown; pdpaAccepted: unknown },
  deps: PortalDeps,
): Promise<ApplyState> {
  const { repo } = deps;
  const name = normalizeName(input.name);
  const phone = String(input.phone ?? '').replace(/\D/g, '');
  validateRegistration(name, phone, input.pdpaAccepted);

  const lineUserId = input.lineUserId;
  const pdpa = { version: PDPA_VERSION, lineUserId };
  let applicant: Applicant | null = null;
  let how = '';

  // 1) บัญชีเดิมที่เปิดอยู่ (จาก LINE หรือ token) → อัปเดตข้อมูล
  //    กรอกครบไปแล้ว → ไม่เขียนทับชื่อ/เบอร์ (แก้ได้ทางแอดมินเท่านั้น) บันทึกแค่การยินยอม
  const existing = await resolveApplicant({ token: input.token, lineUserId }, deps);
  if (existing) {
    applicant = isProfileComplete(existing)
      ? await repo.updateApplicant(existing.id, { pdpa })
      : await repo.updateApplicant(existing.id, { name, phone, pdpa });
    how = 'ลงทะเบียน (บัญชีที่มีอยู่)';
  }

  // 2) เบอร์ตรงกับผู้สมัครที่มีอยู่ (เช่น HR เพิ่มไว้ให้) → ผูก LINE ได้เฉพาะแถวที่ยังไม่มี LINE
  if (!applicant) {
    const [match] = await repo.findApplicantsByPhone(phone);
    if (match) {
      if (!lineUserId) throw new PortalError('not_allowed', MSG.phoneExistsWeb);
      if (match.lineUserId && match.lineUserId !== lineUserId) throw new PortalError('line_mismatch', MSG.phoneOtherLine);
      applicant = await repo.updateApplicant(match.id, { name, pdpa, bindLineUserId: lineUserId });
      how = 'ผูกบัญชี LINE กับผู้สมัครเดิม';
    }
  }

  // 3) ไม่พบ → สร้างใหม่
  if (!applicant) {
    applicant = await repo.createApplicant({ name, phone, lineUserId, pdpa });
    how = 'ลงทะเบียนใหม่';
  }

  await repo.logActivity({
    actor: name,
    action: how,
    targetId: applicant.code,
    targetName: name,
    detail: `PDPA ${PDPA_VERSION}${lineUserId ? '' : ' (ไม่ได้เปิดจาก LINE)'}`,
  });
  if (applicant.lineUserId && !applicant.approved) {
    await pushWelcome(applicant, deps);
  }
  return buildState(applicant, deps);
}

async function pushWelcome(applicant: Applicant, deps: PortalDeps) {
  const { line, repo, config } = deps;
  if (!applicant.lineUserId) return;
  const link = buildPersonalLink(config, applicant.accessToken);
  const ok = await line
    .push(applicant.lineUserId, [
      {
        type: 'flex',
        altText: `ลงทะเบียนสำเร็จค่ะคุณ${applicant.name}`,
        contents: buildNotifyFlex({
          tone: 'info',
          title: 'ลงทะเบียนสำเร็จ',
          greeting: `ลงทะเบียนสำเร็จค่ะคุณ${applicant.name}`,
          note: {
            label: 'ขั้นตอนถัดไป',
            text: 'กรุณารอเจ้าหน้าที่ตรวจสอบและอนุมัติข้อมูลก่อน จึงจะสามารถเริ่มแนบเอกสารได้ ระบบจะแจ้งเตือนทันทีที่อนุมัติเรียบร้อย',
            tone: 'info',
          },
          button: { label: 'เปิดลิงก์ส่วนตัว', uri: link },
          logoUrl: config.logoUrl,
        }),
      },
    ])
    .catch((err) => {
      console.error('[apply] push welcome failed', err);
      return false;
    });
  await repo.logNotification({
    type: 'welcome',
    applicant,
    status: ok ? 'ok' : 'error',
    messagePreview: 'ลงทะเบียนสำเร็จ',
    error: ok ? undefined : 'push failed',
  });
}

export async function acceptPdpa(
  input: { token: string | null; lineUserId: string | null },
  deps: PortalDeps,
): Promise<ApplyState> {
  const applicant = await requireByToken(input.token, deps);
  if (applicant.lineUserId && input.lineUserId && applicant.lineUserId !== input.lineUserId) {
    throw new PortalError('line_mismatch', MSG.lineMismatch);
  }
  const updated = await deps.repo.updateApplicant(applicant.id, {
    pdpa: { version: PDPA_VERSION, lineUserId: input.lineUserId },
  });
  await deps.repo.logActivity({
    actor: updated.name || 'Applicant',
    action: 'ยินยอม PDPA',
    targetId: updated.code,
    targetName: updated.name,
    detail: `version: ${PDPA_VERSION}`,
  });
  return buildState(updated, deps);
}

export async function getState(token: string | null, deps: PortalDeps): Promise<ApplyState> {
  return buildState(await requireByToken(token, deps), deps);
}

// ---------------------------------------------------------------------------
// อัปโหลด

export interface UploadFileInput {
  bytes: Uint8Array;
}

export async function uploadDocuments(
  input: { token: string | null; docKey: string; subitemTitle: string; files: UploadFileInput[] },
  deps: PortalDeps,
): Promise<ApplyState> {
  const { repo, config } = deps;
  const applicant = await requireByToken(input.token, deps);
  if (!isProfileComplete(applicant) || !isPdpaAccepted(applicant)) {
    throw new PortalError('not_allowed', 'กรุณาลงทะเบียนและยินยอม PDPA ให้เรียบร้อยก่อนแนบเอกสาร');
  }
  if (!applicant.approved) {
    throw new PortalError(
      'not_allowed',
      'บัญชีของคุณยังไม่ได้รับการอนุมัติจากเจ้าหน้าที่ กรุณารอการอนุมัติก่อนแนบเอกสาร',
    );
  }

  const [allDocs, before] = await Promise.all([repo.getDocTypes(), repo.getDocState(applicant.id)]);
  const docs = requiredDocsFor(applicant.requiredDocKeys, allDocs);
  // อัปโหลดได้เฉพาะเอกสารในชุดของคนนี้ที่ยังเปิดใช้งาน (ตามระบบเดิม)
  const doc = docs.find((d) => d.key === input.docKey && d.enabled);
  if (!doc) throw new PortalError('invalid_input', 'ไม่พบประเภทเอกสารนี้ หรือปิดรับเอกสารนี้แล้ว');

  const subitemTitle = input.subitemTitle ?? '';
  if (subitemTitle && !doc.subitems.some((s) => s.title === subitemTitle)) {
    throw new PortalError('invalid_input', 'ไม่พบหัวข้อนี้ในเอกสาร กรุณาโหลดหน้าใหม่');
  }
  if (!subitemTitle && doc.subitems.length > 0) {
    throw new PortalError('invalid_input', 'กรุณาเลือกหัวข้อย่อยของเอกสารก่อนแนบไฟล์');
  }

  const view = buildDocsView(applicant, allDocs, before.files, before.reviews);
  const item = [view.allInOne, ...view.required, ...view.optional].find((d) => d?.key === doc.key);
  const locked = subitemTitle
    ? item?.subitems.find((s) => s.title === subitemTitle)?.state === 'approved'
    : item?.state === 'approved';
  if (locked || applicant.onboardNotified) {
    throw new PortalError('not_allowed', 'เอกสารนี้ได้รับการอนุมัติแล้ว หากต้องการแก้ไข กรุณาติดต่อเจ้าหน้าที่');
  }

  const files = input.files;
  if (files.length === 0) throw new PortalError('invalid_input', 'ไม่มีไฟล์ที่จะอัปโหลด');
  if (files.length > MAX_FILES_PER_UPLOAD) {
    throw new PortalError('invalid_input', `ส่งได้ครั้งละไม่เกิน ${MAX_FILES_PER_UPLOAD} ไฟล์`);
  }
  if (subitemTitle && files.length > 1) {
    throw new PortalError('invalid_input', 'หัวข้อย่อยแนบได้เพียง 1 ไฟล์');
  }
  const typed = files.map((f, i) => {
    const mime = sniffMime(f.bytes);
    if (!mime) throw new PortalError('invalid_input', `ไฟล์ที่ ${i + 1}: รองรับเฉพาะ JPG, PNG, WEBP หรือ PDF เท่านั้น`);
    if (f.bytes.length > config.maxUploadBytes) {
      const mb = (f.bytes.length / 1024 / 1024).toFixed(1);
      throw new PortalError(
        'invalid_input',
        `ไฟล์ที่ ${i + 1} มีขนาด ${mb} MB เกิน ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB`,
      );
    }
    return { ...f, mime };
  });
  if (typed.length > 1 && typed.some((f) => f.mime === 'application/pdf')) {
    throw new PortalError('invalid_input', 'ไฟล์ PDF แนบได้ทีละไฟล์ หากมีหลายหน้าให้รวมเป็น PDF เดียว');
  }

  // ไฟล์แรกแทนที่ของเดิม ไฟล์ถัดไปเพิ่มต่อ (เหมือน append ของระบบเดิม)
  for (const [i, f] of typed.entries()) {
    await repo.saveUploadedFile({
      applicant,
      docKey: doc.key,
      subitemTitle,
      bytes: f.bytes,
      mimeType: f.mime,
      source: 'web',
      replaceExisting: i === 0,
    });
  }

  const label = subitemTitle ? `${doc.label} - ${subitemTitle}` : doc.label;
  const totalKb = Math.round(typed.reduce((n, f) => n + f.bytes.length, 0) / 1024);
  await repo.logActivity({
    actor: applicant.name || 'Applicant',
    action: 'อัปโหลดเอกสาร',
    targetId: applicant.code,
    targetName: applicant.name,
    detail: `${label} (${typed.length} ไฟล์, ${totalKb} KB)`,
  });

  const state = await buildState(applicant, deps);
  if (!view.allSatisfied && state.docs?.allSatisfied) await pushDocsComplete(applicant, state.docs.total, deps);
  return state;
}

async function pushDocsComplete(applicant: Applicant, total: number, deps: PortalDeps) {
  const { line, repo, config } = deps;
  if (!applicant.lineUserId) return;
  const ok = await line
    .push(applicant.lineUserId, [
      {
        type: 'flex',
        altText: `คุณ${applicant.name} ส่งเอกสารครบถ้วนแล้ว`,
        contents: buildDocsCompleteFlex(applicant.name, total, config.logoUrl),
      },
    ])
    .catch((err) => {
      console.error('[apply] push docs complete failed', err);
      return false;
    });
  await repo.logNotification({
    type: 'docs_complete',
    applicant,
    status: ok ? 'ok' : 'error',
    messagePreview: 'ส่งเอกสารครบถ้วนแล้ว',
    error: ok ? undefined : 'push failed',
  });
}
