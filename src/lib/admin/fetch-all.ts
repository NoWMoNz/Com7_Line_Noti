import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

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

/** ผู้สมัคร (ไม่ซ้ำ) ที่มีผลตรวจสถานะนี้อย่างน้อย 1 ช่อง — อ่านทีละ 1,000 แถว */
export async function applicantIdsWithReview(db: SupabaseClient, status: 'pending_review' | 'rejected'): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const res = await db
      .from('doc_reviews')
      .select('applicant_id')
      .eq('status', status)
      .order('applicant_id')
      .order('doc_key')
      .order('subitem_title')
      .range(from, from + PAGE - 1);
    if (res.error) throw new Error(`doc_reviews: ${res.error.message}`);
    res.data.forEach((r) => ids.add((r as { applicant_id: string }).applicant_id));
    if (res.data.length < PAGE) break;
  }
  return ids;
}
