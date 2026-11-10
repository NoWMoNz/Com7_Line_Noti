/**
 * แปลงไฟล์ JSON ที่ส่งออกจาก Google Sheets (scripts/gas/ExportForMigration.gs)
 * ให้เป็นแถวพร้อมใส่ฐานข้อมูลใหม่ — เป็นฟังก์ชันบริสุทธิ์ ไม่ยุ่งกับฐานข้อมูล จึงทดสอบได้
 *
 * จัดการความไม่สม่ำเสมอของข้อมูลเดิม:
 *  - URL ในเซลล์มีหลายรูปแบบ: "url", "docKey::url", "docKey::หัวข้อ::url", "application::หัวข้อ::url" (จาก LINE)
 *  - ไฟล์รวม all-in-one เคยถูกคัดลอก URL ไปใส่เซลล์เอกสารอื่นที่ว่าง → ตัดออก (ใช้ covers_all แทน)
 *  - doc_reviews_json มีทั้งรูปแบบย่อ {s,r,t,by} และรูปแบบเต็ม {status,reason,updatedAt,reviewedBy}
 *  - วันที่มีทั้ง ISO และ "dd/MM/yyyy HH:mm:ss" (บางแถวเป็นปี พ.ศ.)
 */

export interface SheetExport {
  exportedAt?: string;
  sheets: Record<string, unknown[][]>;
}

export interface DocTypeRow {
  key: string;
  label: string;
  description: string;
  sort_order: number;
  enabled: boolean;
  optional: boolean;
  covers_all: boolean;
}
export interface DocSubitemRow {
  doc_key: string;
  title: string;
  sort_order: number;
  optional: boolean;
}
export interface BranchRow {
  shop_code: string | null;
  shop_name: string;
  company: string;
  main_unit: string | null;
  rsm: string | null;
  asm: string | null;
  province: string | null;
  region: string | null;
  ta: string | null;
  intern: string | null;
}
export type ApplicantRow = { code: string; branch_label: string | null } & Record<string, unknown>;
export interface LegacyFileRow {
  applicant_code: string;
  doc_key: string;
  subitem_title: string;
  legacy_url: string;
}
export interface ReviewRow {
  applicant_code: string;
  doc_key: string;
  subitem_title: string;
  status: 'pending_review' | 'approved' | 'rejected';
  reason: string;
  reviewed_by: string | null;
  updated_at: string;
}
export interface AdminRow {
  legacy_admin_id: string | null;
  email: string;
  full_name: string;
  role: 'Developer' | 'SuperAdmin' | 'Admin2' | 'Admin';
  active: boolean;
  created_at: string | null;
  last_login_at: string | null;
}
export interface NotificationRow {
  created_at: string;
  type: string;
  applicant_code: string | null;
  applicant_name: string | null;
  phone: string | null;
  sent_by: string;
  status: string;
  message_preview: string | null;
  error: string | null;
}
export interface AuditRow {
  created_at: string;
  kind: 'audit' | 'activity';
  actor: string;
  action: string;
  target_id: string | null;
  target_name: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  detail: string | null;
}

export interface MigrationPlan {
  docTypes: DocTypeRow[];
  docSubitems: DocSubitemRow[];
  branches: BranchRow[];
  applicants: ApplicantRow[];
  files: LegacyFileRow[];
  reviews: ReviewRow[];
  admins: AdminRow[];
  settings: Array<{ key: string; value: unknown }>;
  notifications: NotificationRow[];
  audits: AuditRow[];
  warnings: string[];
}

/** prefix ที่ LINE bot ระบบเดิมใช้แทน doc key ในเซลล์/ผลตรวจ */
const LINE_CANON_TO_DOC: Record<string, string> = {
  application: 'doc1_application_set',
  guarantor: 'doc6_guarantor',
  'guarantor-copy': 'doc11_guarantor_copy',
};

const SECRET_SETTING_KEYS = new Set(['CHANNEL_ACCESS_TOKEN']);

// ---------------------------------------------------------------------------
// helpers

export function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/^'/, '').trim();
}
const orNull = (s: string) => (s ? s : null);

function headerIndex(row: unknown[] | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  (row ?? []).forEach((h, i) => {
    const k = str(h);
    if (k && map[k] === undefined) map[k] = i;
  });
  return map;
}

/** แปลงเป็น ISO timestamp; รองรับ ISO และ dd/MM/yyyy[ HH:mm[:ss]] (เวลาไทย, ปี พ.ศ. ได้) */
export function parseTimestamp(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let year = Number(m[3]);
    if (year > 2400) year -= 543;
    const pad = (n: string | undefined) => String(Number(n ?? 0)).padStart(2, '0');
    const iso = `${year}-${pad(m[2])}-${pad(m[1])}T${pad(m[4])}:${pad(m[5])}:${pad(m[6])}+07:00`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** วันที่อย่างเดียว (yyyy-MM-dd) ตามเวลาไทย */
export function parseDateOnly(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = parseTimestamp(s);
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function normalizeThaiPhone(raw: unknown): string {
  let s = str(raw).replace(/[\s\-.()]/g, '');
  if (s.startsWith('+66')) s = '0' + s.slice(3);
  else if (s.startsWith('66') && s.length >= 11) s = '0' + s.slice(2);
  s = s.replace(/\D/g, '');
  // ชีทเคยเก็บเบอร์เป็นตัวเลข ทำให้ 0 นำหน้าหาย (812345678 → 0812345678)
  if (/^[689]\d{8}$/.test(s)) s = '0' + s;
  return s;
}

function truthy(v: unknown): boolean {
  const s = str(v).toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}

function normalizeRole(v: unknown): AdminRow['role'] {
  const r = str(v).toLowerCase();
  if (r === 'developer' || r === 'dev') return 'Developer';
  if (r === 'superadmin' || r === 'super_admin' || r === 'super admin') return 'SuperAdmin';
  if (r === 'admin2' || r === 'admin_2' || r === 'admin 2') return 'Admin2';
  return 'Admin';
}

const normTitle = (t: string) => t.replace(/\(ถ้ามี\)/g, '').replace(/\s+/g, '').toLowerCase();

// ---------------------------------------------------------------------------

/** token ใหม่สำหรับผู้สมัครที่ไม่มี token เดิม (สุ่ม 122 บิต เหมือน default ของฐานข้อมูล) */
const newToken = () => crypto.randomUUID().replace(/-/g, '');

export function buildMigrationPlan(exp: SheetExport): MigrationPlan {
  const warnings: string[] = [];
  const sheets = exp.sheets ?? {};
  // เวลาสำรองสำหรับแถวที่ไม่มีวันที่ (คงที่ต่อไฟล์ export เดียวกัน → รันซ้ำได้ผลเท่าเดิม)
  const fallbackTime = parseTimestamp(exp.exportedAt) ?? new Date().toISOString();

  // ----- DocConfig -----
  const docRows = sheets['DocConfig'] ?? [];
  const dh = headerIndex(docRows[0]);
  const col = (h: Record<string, number>, name: string, fallback: number) => (h[name] ?? fallback);
  const docTypes: DocTypeRow[] = [];
  const docSubitems: DocSubitemRow[] = [];
  const subitemsByDoc = new Map<string, DocSubitemRow[]>();

  docRows.slice(1).forEach((r) => {
    const key = str(r[col(dh, 'doc_key', 0)]);
    const label = str(r[col(dh, 'doc_label', 1)]);
    if (!key || !label) return;
    if (docTypes.some((d) => d.key === key)) {
      warnings.push(`DocConfig: doc_key ซ้ำ "${key}" — ใช้แถวแรก`);
      return;
    }
    const enabledRaw = r[col(dh, 'enabled', 4)];
    const en = str(enabledRaw).toLowerCase();
    const enabled = !(enabledRaw === false || enabledRaw === 0 || en === 'false' || en === 'no' || en === '0');
    const coversAll = key === 'doc0_all_in_one';
    docTypes.push({
      key,
      label,
      description: str(r[col(dh, 'doc_description', 2)]),
      sort_order: docTypes.length,
      enabled,
      optional: coversAll,
      covers_all: coversAll,
    });

    let subs: unknown[] = [];
    const rawSubs = r[col(dh, 'doc_subitems', 3)];
    try {
      if (Array.isArray(rawSubs)) subs = rawSubs;
      else if (str(rawSubs).startsWith('[')) subs = JSON.parse(str(rawSubs));
    } catch {
      warnings.push(`DocConfig: doc_subitems ของ "${key}" ไม่ใช่ JSON ที่ถูกต้อง — ข้าม`);
    }
    const list: DocSubitemRow[] = [];
    subs.forEach((s) => {
      const obj = typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : null;
      const title = str(obj ? obj.title ?? obj.label : s);
      if (!title || list.some((x) => x.title === title)) return;
      list.push({
        doc_key: key,
        title,
        sort_order: list.length,
        optional: (obj?.optional === true) || title.includes('(ถ้ามี)'),
      });
    });
    subitemsByDoc.set(key, list);
    docSubitems.push(...list);
  });
  const docKeys = new Set(docTypes.map((d) => d.key));

  const matchSubitem = (docKey: string, raw: string): string | null => {
    const list = subitemsByDoc.get(docKey) ?? [];
    const exact = list.find((s) => s.title === raw);
    if (exact) return exact.title;
    const n = normTitle(raw);
    return list.find((s) => normTitle(s.title) === n)?.title ?? null;
  };
  const resolveDocKey = (prefix: string): string | null =>
    docKeys.has(prefix) ? prefix : LINE_CANON_TO_DOC[prefix] && docKeys.has(LINE_CANON_TO_DOC[prefix]) ? LINE_CANON_TO_DOC[prefix] : null;

  // ----- Database (สาขา) -----
  const dbRows = sheets['Database'] ?? [];
  const bh: Record<string, number> = {};
  (dbRows[0] ?? []).forEach((h, i) => {
    const k = str(h).toLowerCase().replace(/\s+/g, '');
    if (k && bh[k] === undefined) bh[k] = i;
  });
  const pick = (row: unknown[], ...aliases: string[]) => {
    for (const a of aliases) {
      const i = bh[a.toLowerCase()];
      if (i !== undefined && str(row[i])) return str(row[i]);
    }
    return '';
  };
  const branches: BranchRow[] = [];
  dbRows.slice(1).forEach((r) => {
    const code = pick(r, 'id', 'ii', 'id_shop', 'รหัสสาขา');
    const shop = pick(r, 'shop', 'ชื่อสาขา', 'สาขา');
    if (!code && !shop) return;
    branches.push({
      shop_code: orNull(code),
      shop_name: shop || code,
      company: pick(r, 'company', 'บริษัท') || 'Com7',
      main_unit: orNull(pick(r, 'bu', 'mainunit', 'หน่วยงานหลัก', 'หน่วยงาน')),
      rsm: orNull(pick(r, 'rsm')),
      asm: orNull(pick(r, 'asm')),
      province: orNull(pick(r, 'จังหวัด', 'province')),
      region: orNull(pick(r, 'ภาค', 'region')),
      ta: orNull(pick(r, 'ta')),
      intern: orNull(pick(r, 'intern')),
    });
  });

  // ----- Applicants -----
  const appRows = sheets['Applicants'] ?? [];
  const ah = headerIndex(appRows[0]);
  const get = (r: unknown[], ...names: string[]) => {
    for (const n of names) {
      if (ah[n] !== undefined && str(r[ah[n]])) return r[ah[n]];
    }
    return '';
  };

  const applicants: ApplicantRow[] = [];
  const files: LegacyFileRow[] = [];
  const reviewsByKey = new Map<string, ReviewRow>();
  const seenCodes = new Set<string>();
  const seenLine = new Set<string>();
  const seenTokens = new Set<string>();
  let skippedReviewKeys = 0;

  appRows.slice(1).forEach((r, i) => {
    const code = str(get(r, 'applicant_id'));
    if (!code) return;
    const rowNo = i + 2;
    if (seenCodes.has(code)) {
      warnings.push(`Applicants แถว ${rowNo}: applicant_id ซ้ำ "${code}" — ข้ามแถวนี้`);
      return;
    }
    seenCodes.add(code);

    const row: ApplicantRow = {
      code,
      name: str(get(r, 'name')),
      phone: orNull(normalizeThaiPhone(get(r, 'phone'))),
      branch_label: orNull(str(get(r, 'branch'))),
      company: orNull(str(get(r, 'company'))),
      position: orNull(str(get(r, 'position'))),
      ta: orNull(str(get(r, 'ta'))),
      intern: orNull(str(get(r, 'intern'))),
      notes: str(get(r, 'notes')),
      admin_feedback: str(get(r, 'admin_feedback', 'feedback')),
      salary: Number(str(get(r, 'salary')).replace(/,/g, '')) || null,
      start_date: parseDateOnly(get(r, 'start_date', 'startDate')),
      deadline: parseTimestamp(get(r, 'deadline')),
      approved: truthy(get(r, 'approved')),
      pdpa_version: orNull(str(get(r, 'pdpa_version'))),
      pdpa_accepted_at: parseTimestamp(get(r, 'pdpa_accepted_at')),
      pdpa_line_user_id: orNull(str(get(r, 'pdpa_line_user_id'))),
      onboard_notified_at: parseTimestamp(get(r, 'onboard_notified_at')),
      onboard_notes: str(get(r, 'onboard_notes')),
      onboard_updated_at: parseTimestamp(get(r, 'onboard_updated_at')),
      onboard_updated_by: orNull(str(get(r, 'onboard_updated_by'))),
      last_uploaded_at: parseTimestamp(get(r, 'last_uploaded_at')),
      last_notified_at: parseTimestamp(get(r, 'last_notified_at')),
      admin_reviewed_at: parseTimestamp(get(r, 'admin_reviewed_at')),
      completed_at: parseTimestamp(get(r, 'completed_at')),
      followup_sent_at: parseTimestamp(get(r, 'followup_sent_at')),
      followup_status: orNull(str(get(r, 'followup_status'))),
      legacy_drive_folder_id: orNull(str(get(r, 'drive_folder_id'))),
      // ทุกแถวต้องมีคีย์ครบชุดเดียวกัน (bulk upsert ของ supabase-js เติม null ให้คีย์ที่ขาด)
      line_user_id: null,
      required_doc_keys: null,
      access_token: newToken(),
      created_at: fallbackTime,
    };

    const lineId = str(get(r, 'line_user_id'));
    if (lineId) {
      if (seenLine.has(lineId)) {
        warnings.push(`Applicants แถว ${rowNo} (${code}): line_user_id ซ้ำกับผู้สมัครคนก่อน — ไม่ผูก LINE ให้แถวนี้`);
      } else {
        seenLine.add(lineId);
        row.line_user_id = lineId;
      }
    }
    const token = str(get(r, 'token'));
    if (token) {
      if (seenTokens.has(token)) {
        warnings.push(`Applicants แถว ${rowNo} (${code}): token ซ้ำ — จะออก token ใหม่ให้`);
      } else {
        seenTokens.add(token);
        row.access_token = token;
      }
    }
    row.created_at =
      parseTimestamp(get(r, 'created_at')) ??
      (row.pdpa_accepted_at as string | null) ??
      (row.last_uploaded_at as string | null) ??
      fallbackTime;

    const reqRaw = str(get(r, 'required_docs_json'));
    if (reqRaw) {
      try {
        const keys = JSON.parse(reqRaw);
        if (Array.isArray(keys)) {
          const valid = keys.map(String).filter((k) => docKeys.has(k));
          if (valid.length) row.required_doc_keys = valid;
        }
      } catch {
        warnings.push(`Applicants แถว ${rowNo} (${code}): required_docs_json อ่านไม่ได้ — ใช้ชุดเอกสารปัจจุบัน`);
      }
    }
    applicants.push(row);

    // ----- ไฟล์ในเซลล์ -----
    const allInOneUrls = new Set<string>();
    const sortedDocs = [...docTypes].sort((a, b) => Number(b.covers_all) - Number(a.covers_all));
    for (const doc of sortedDocs) {
      const ci = ah[doc.key];
      if (ci === undefined) continue;
      const seen = new Set<string>();
      for (const line of str(r[ci]).split('\n')) {
        const t = line.trim();
        if (!t) continue;
        const idx = t.lastIndexOf('::');
        const url = (idx === -1 ? t : t.slice(idx + 2)).trim();
        if (!/^https?:\/\//i.test(url)) continue;
        if (doc.covers_all) allInOneUrls.add(url);
        else if (allInOneUrls.has(url)) continue; // URL ที่ถูกคัดลอกมาจากไฟล์รวม

        let subitem = '';
        if (idx !== -1) {
          const parts = t.slice(0, idx).split('::');
          if (parts.length >= 2) subitem = matchSubitem(doc.key, parts.slice(1).join('::')) ?? '';
        }
        const k = subitem + '\u0000' + url;
        if (seen.has(k)) continue;
        seen.add(k);
        files.push({ applicant_code: code, doc_key: doc.key, subitem_title: subitem, legacy_url: url });
      }
    }

    // ----- ผลตรวจ -----
    const revRaw = str(get(r, 'doc_reviews_json'));
    if (revRaw) {
      let obj: Record<string, unknown> = {};
      try {
        obj = JSON.parse(revRaw) ?? {};
      } catch {
        warnings.push(`Applicants แถว ${rowNo} (${code}): doc_reviews_json อ่านไม่ได้ — ข้ามผลตรวจของคนนี้`);
      }
      for (const [rawKey, rawEntry] of Object.entries(obj)) {
        if (!rawEntry || typeof rawEntry !== 'object') continue;
        const e = rawEntry as Record<string, unknown>;
        const status = str(e.status ?? e.s);
        if (status !== 'pending_review' && status !== 'approved' && status !== 'rejected') continue;

        const parts = rawKey.split('::');
        const docKey = resolveDocKey(parts[0]);
        let subitem = '';
        if (docKey && parts.length >= 2) subitem = matchSubitem(docKey, parts.slice(1).join('::')) ?? '\u0000';
        if (!docKey || subitem === '\u0000') {
          skippedReviewKeys++;
          continue;
        }
        const review: ReviewRow = {
          applicant_code: code,
          doc_key: docKey,
          subitem_title: subitem,
          status,
          reason: status === 'approved' ? '' : str(e.reason ?? e.r),
          reviewed_by: orNull(str(e.reviewedBy ?? e.by)),
          updated_at: parseTimestamp(e.updatedAt ?? e.t) ?? new Date(0).toISOString(),
        };
        const k = `${code}\u0000${docKey}\u0000${subitem}`;
        const prev = reviewsByKey.get(k);
        if (!prev || prev.updated_at <= review.updated_at) reviewsByKey.set(k, review);
      }
    }
  });
  if (skippedReviewKeys) {
    warnings.push(`ข้ามผลตรวจ ${skippedReviewKeys} รายการ ที่อ้างถึงเอกสาร/หัวข้อที่ไม่มีใน DocConfig แล้ว`);
  }

  // ----- Login Admin -----
  const adminRows = sheets['Login Admin'] ?? [];
  const adh = headerIndex(adminRows[0]);
  const ag = (r: unknown[], n: string) => (adh[n] === undefined ? '' : r[adh[n]]);
  const admins: AdminRow[] = [];
  adminRows.slice(1).forEach((r) => {
    const email = str(ag(r, 'email')).toLowerCase();
    if (!email.includes('@') || admins.some((a) => a.email === email)) return;
    const status = str(ag(r, 'status')).toLowerCase();
    admins.push({
      legacy_admin_id: orNull(str(ag(r, 'admin_id'))),
      email,
      full_name: str(ag(r, 'full_name')),
      role: normalizeRole(ag(r, 'role')),
      active: !status || ['active', 'enabled', '1', 'true'].includes(status),
      created_at: parseTimestamp(ag(r, 'created_at')),
      last_login_at: parseTimestamp(ag(r, 'last_login')),
    });
  });

  // ----- Config -----
  const settings: Array<{ key: string; value: unknown }> = [];
  (sheets['Config'] ?? []).forEach((r) => {
    const key = str(r[0]);
    if (!key || SECRET_SETTING_KEYS.has(key) || settings.some((s) => s.key === key)) return;
    const raw = r[1];
    let value: unknown = raw ?? '';
    if (typeof raw === 'string' && /^[[{]/.test(raw.trim())) {
      try {
        value = JSON.parse(raw);
      } catch {
        /* เก็บเป็นข้อความ */
      }
    }
    settings.push({ key, value });
  });

  // ----- Logs -----
  const logRows = (name: string) => {
    const rows = sheets[name] ?? [];
    const h = headerIndex(rows[0]);
    return rows.slice(1).map((r) => (n: string) => orNull(h[n] === undefined ? '' : str(r[h[n]])));
  };
  const notifications: NotificationRow[] = logRows('Notification_Log')
    .map((g) => ({
      created_at: parseTimestamp(g('TimeStamp')) ?? fallbackTime,
      type: g('Type') ?? 'unknown',
      applicant_code: g('Applicant_ID'),
      applicant_name: g('Applicant_Name'),
      phone: g('Phone'),
      sent_by: g('Sent_By') ?? 'System',
      status: g('Status') ?? 'ok',
      message_preview: g('Message_Preview'),
      error: g('Error'),
    }))
    .filter((n) => n.type !== 'unknown' || n.applicant_code);
  const audits: AuditRow[] = [
    ...logRows('Audit_Log').map(
      (g): AuditRow => ({
        created_at: parseTimestamp(g('TimeStamp')) ?? fallbackTime,
        kind: 'audit',
        actor: g('Admin') ?? 'Admin',
        action: g('Action') ?? '',
        target_id: g('Target_ID'),
        target_name: g('Target_Name'),
        field: g('Field'),
        old_value: g('Old_Value'),
        new_value: g('New_Value'),
        detail: g('Detail'),
      }),
    ),
    ...logRows('Database_Logs').map(
      (g): AuditRow => ({
        created_at: parseTimestamp(g('TimeStamp')) ?? fallbackTime,
        kind: 'activity',
        actor: g('Name') ?? 'System',
        action: g('Action') ?? '',
        target_id: g('Target_ID'),
        target_name: null,
        field: null,
        old_value: null,
        new_value: null,
        detail: g('Changes_Detail'),
      }),
    ),
  ].filter((a) => a.action);

  return {
    docTypes,
    docSubitems,
    branches,
    applicants,
    files,
    reviews: [...reviewsByKey.values()],
    admins,
    settings,
    notifications,
    audits,
    warnings,
  };
}
