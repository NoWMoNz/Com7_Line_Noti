import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pendingReviews } from './logic';

/** PostgREST ของ Supabase ตอบได้ครั้งละไม่เกิน 1,000 แถว (เกินจะถูกตัดเงียบๆ) */
const PAGE = 1000;
/** id ต่อคำขอ — กัน URL ยาวเกิน (uuid ละ ~37 ตัวอักษร) */
const IDS_PER_REQUEST = 80;

/**
 * ดึงทุกแถวของตารางที่อ้างถึงผู้สมัครกลุ่มหนึ่ง — แบ่ง id เป็นชุด และไล่หน้าจนครบ
 * ใช้แทน .in('applicant_id', ids) ตรงๆ ซึ่งพังเงียบเมื่อผลเกิน 1,000 แถว หรือ id เยอะจน URL ยาวเกิน
 */
export async function selectForApplicants<T>(
  db: SupabaseClient,
  table: 'applicant_files' | 'doc_reviews',
  columns: string,
  ids: string[],
  opts: { currentOnly?: boolean } = {},
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) chunks.push(ids.slice(i, i + IDS_PER_REQUEST));

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const rows: T[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = db.from(table).select(columns).in('applicant_id', chunk);
        if (opts.currentOnly) q = q.eq('is_current', true);
        // เรียงให้คงที่ ไม่งั้นการแบ่งหน้าอาจข้าม/ซ้ำแถว
        const res = await q.order('applicant_id').order('doc_key').order('subitem_title').range(from, from + PAGE - 1);
        if (res.error) throw new Error(`${table}: ${res.error.message}`);
        rows.push(...(res.data as T[]));
        if (res.data.length < PAGE) break;
      }
      return rows;
    }),
  );
  return results.flat();
}

type ReviewKey = { applicant_id: string; doc_key: string; subitem_title: string };

async function reviewKeys(db: SupabaseClient, status: 'pending_review' | 'rejected' | 'approved', parentsOnly = false): Promise<ReviewKey[]> {
  const out: ReviewKey[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from('doc_reviews').select('applicant_id, doc_key, subitem_title').eq('status', status);
    if (parentsOnly) q = q.eq('subitem_title', '');
    const res = await q.order('applicant_id').order('doc_key').order('subitem_title').range(from, from + PAGE - 1);
    if (res.error) throw new Error(`doc_reviews: ${res.error.message}`);
    out.push(...(res.data as ReviewKey[]));
    if (res.data.length < PAGE) break;
  }
  return out;
}

/**
 * ผู้สมัคร (ไม่ซ้ำ) ที่มีผลตรวจสถานะนี้อย่างน้อย 1 ช่อง — อ่านทีละ 1,000 แถว
 * "รอตรวจ" ใช้กฎเดียวกับ pendingReviews() (ไม่นับหัวข้อย่อยใต้เอกสารที่อนุมัติแล้ว / ทุกอย่างเมื่อไฟล์รวมอนุมัติแล้ว)
 */
export async function applicantIdsWithReview(db: SupabaseClient, status: 'pending_review' | 'rejected'): Promise<Set<string>> {
  if (status === 'rejected') return new Set((await reviewKeys(db, 'rejected')).map((r) => r.applicant_id));
  const [pending, approvedParents, allInOneRes] = await Promise.all([
    reviewKeys(db, 'pending_review'),
    reviewKeys(db, 'approved', true),
    db.from('doc_types').select('key').eq('covers_all', true),
  ]);
  if (allInOneRes.error) throw new Error(`doc_types: ${allInOneRes.error.message}`);
  const allInOneKeys = new Set((allInOneRes.data as Array<{ key: string }>).map((d) => d.key));
  const byApplicant = new Map<string, Array<{ docKey: string; subitemTitle: string; status: 'pending_review' | 'approved' }>>();
  const push = (r: ReviewKey, s: 'pending_review' | 'approved') => {
    const list = byApplicant.get(r.applicant_id) ?? [];
    list.push({ docKey: r.doc_key, subitemTitle: r.subitem_title, status: s });
    byApplicant.set(r.applicant_id, list);
  };
  pending.forEach((r) => push(r, 'pending_review'));
  approvedParents.forEach((r) => push(r, 'approved'));
  return new Set([...byApplicant].filter(([, list]) => pendingReviews(list, allInOneKeys).length > 0).map(([id]) => id));
}
