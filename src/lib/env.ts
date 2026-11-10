/**
 * อ่าน environment variables ฝั่ง server — ขาดตัวไหนจะ error พร้อมบอกชื่อชัดเจน
 * (อ่านตอนเรียกใช้ ไม่ใช่ตอน import เพื่อไม่ให้ next build ล้มเมื่อยังไม่ได้ตั้งค่า)
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`ยังไม่ได้ตั้งค่า environment variable: ${name} (ดู .env.example)`);
  }
  return v.trim();
}

export const serverEnv = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  /** secret key (sb_secret_...) หรือ service_role key แบบเดิม — ห้ามส่งไปฝั่ง browser */
  supabaseSecretKey: () => required('SUPABASE_SECRET_KEY'),
  lineChannelSecret: () => required('LINE_CHANNEL_SECRET'),
  lineChannelAccessToken: () => required('LINE_CHANNEL_ACCESS_TOKEN'),
  liffId: () => process.env.NEXT_PUBLIC_LIFF_ID?.trim() ?? '',
  appBaseUrl: () => process.env.APP_BASE_URL?.trim() ?? '',
  lineLogoUrl: () => process.env.LINE_LOGO_URL?.trim() ?? '',
  maxUploadBytes: () => Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024,
};
