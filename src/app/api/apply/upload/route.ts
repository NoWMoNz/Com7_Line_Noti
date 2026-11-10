/**
 * อัปโหลดเอกสาร: multipart/form-data { token, docKey, subitemTitle, files[] }
 * ชนิดไฟล์ตรวจจาก byte จริง (ไม่เชื่อ Content-Type จาก browser) — ดู sniffMime
 */
import { MAX_FILES_PER_UPLOAD, PortalError, uploadDocuments } from '@/lib/apply/portal';
import { getPortalDeps, respond, str } from '@/lib/apply/server';

export const maxDuration = 60;

export async function POST(request: Request) {
  return respond(async () => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new PortalError('invalid_input', 'ข้อมูลไฟล์ไม่ถูกต้อง กรุณาลองใหม่');
    }
    const entries = form.getAll('files').filter((f): f is File => f instanceof File);
    if (entries.length > MAX_FILES_PER_UPLOAD) {
      throw new PortalError('invalid_input', `ส่งได้ครั้งละไม่เกิน ${MAX_FILES_PER_UPLOAD} ไฟล์`);
    }
    const files = await Promise.all(entries.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()) })));
    return uploadDocuments(
      {
        token: str(form.get('token')),
        docKey: String(form.get('docKey') ?? ''),
        subitemTitle: String(form.get('subitemTitle') ?? ''),
        files,
      },
      getPortalDeps(),
    );
  });
}
