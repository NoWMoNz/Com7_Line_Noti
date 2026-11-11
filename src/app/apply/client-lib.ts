/**
 * Helper ฝั่ง browser ของหน้าผู้สมัคร: เริ่ม LIFF, เรียก API, บีบอัดรูป
 */
import type { ApplyResponse } from '@/lib/apply/types';

// ---------------------------------------------------------------------------
// LIFF (LINE MINI App)

export interface LiffInfo {
  /** เปิดอยู่ในแอป LINE */
  inClient: boolean;
  /** ID token ของผู้ใช้ LINE — server จะตรวจกับ LINE ก่อนเชื่อ */
  idToken: string | null;
}

const isLineUserAgent = () => typeof navigator !== 'undefined' && / Line\//i.test(navigator.userAgent);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/**
 * เริ่ม LIFF แล้วคืนข้อมูลผู้ใช้ LINE
 * - ไม่ได้ตั้ง LIFF ID → ทำงานแบบเว็บธรรมดา (ใช้ตอน dev)
 * - เปิดนอกแอป LINE (เช่น LINE บนคอมพิวเตอร์ที่เปิดลิงก์ในเบราว์เซอร์) และยังไม่ล็อกอิน → พาไปล็อกอิน LINE
 *   แล้วกลับมาหน้านี้ — ระบบจำผู้สมัครจากบัญชี LINE ไม่ต้องมีลิงก์ส่วนตัว
 *   (ยกเว้น URL มี token อยู่แล้ว เช่น รีเฟรชหน้า)
 * - เปิดในแอป LINE แต่เริ่ม LIFF ไม่สำเร็จ → throw ให้ผู้ใช้ลองใหม่
 *   (ถ้าปล่อยผ่านเป็นเว็บธรรมดา คนที่ไม่มี token จะลงทะเบียนโดยไม่ผูก LINE)
 */
export async function initLiff(liffId: string, hasToken = false): Promise<LiffInfo> {
  if (!liffId) return { inClient: false, idToken: null };
  try {
    const { default: liff } = await import('@line/liff');
    await withTimeout(liff.init({ liffId }), 10_000);
    const inClient = liff.isInClient();
    if (!inClient && !liff.isLoggedIn() && !hasToken) {
      liff.login({ redirectUri: window.location.href });
      return new Promise<LiffInfo>(() => {}); // กำลังไปหน้าล็อกอิน LINE
    }
    const idToken = liff.isLoggedIn() ? liff.getIDToken() : null;
    if (inClient && !idToken) throw new Error('no id token in LINE client');
    return { inClient, idToken };
  } catch (err) {
    console.warn('[apply] LIFF init failed', err);
    if (isLineUserAgent()) throw new Error('liff');
    return { inClient: false, idToken: null };
  }
}

/**
 * เปิดลิงก์ในเบราว์เซอร์ของเครื่อง (Safari/Chrome) — ในแอป LINE ดาวน์โหลดไฟล์ไม่ได้
 * นอก LINE → แท็บใหม่ตามปกติ
 */
export async function openInBrowser(path: string, inClient: boolean): Promise<void> {
  const url = new URL(path, window.location.origin).toString();
  if (inClient) {
    try {
      const { default: liff } = await import('@line/liff');
      liff.openWindow({ url, external: true });
      return;
    } catch (err) {
      console.warn('[apply] liff.openWindow failed', err);
    }
  }
  window.open(url, '_blank', 'noopener');
}

/** token จาก URL — รองรับรูปแบบ liff.state ที่ LINE ส่งมาตอนเปิดครั้งแรก */
export function readTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const direct = params.get('token');
  if (direct) return direct.trim();
  const state = params.get('liff.state');
  if (state) {
    const q = state.includes('?') ? state.slice(state.indexOf('?') + 1) : state.replace(/^\//, '');
    const t = new URLSearchParams(q).get('token');
    if (t) return t.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// API

export async function callApi(path: string, body: Record<string, unknown>): Promise<ApplyResponse> {
  try {
    const res = await fetch(`/api/apply/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as ApplyResponse | null;
    return data ?? { ok: false, error: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง' };
  } catch {
    return { ok: false, error: 'เชื่อมต่ออินเทอร์เน็ตไม่สำเร็จ กรุณาตรวจสอบสัญญาณแล้วลองใหม่' };
  }
}

/** อัปโหลดพร้อมแสดงความคืบหน้า (fetch บอกความคืบหน้าการส่งไม่ได้ จึงใช้ XHR) */
export function uploadFiles(
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<ApplyResponse> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/apply/upload');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = xhr.response as ApplyResponse | null;
      resolve(data ?? { ok: false, error: `อัปโหลดไม่สำเร็จ (${xhr.status}) กรุณาลองใหม่` });
    };
    xhr.onerror = () =>
      resolve({ ok: false, error: 'เชื่อมต่ออินเทอร์เน็ตไม่สำเร็จ กรุณาตรวจสอบสัญญาณแล้วลองใหม่' });
    xhr.ontimeout = xhr.onerror;
    xhr.timeout = 120_000;
    xhr.send(form);
  });
}

// ---------------------------------------------------------------------------
// บีบอัดรูป (ย้ายมาจาก compressImageFile ของระบบเดิม)

const IMAGE_TARGET_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 2000;
const QUALITY_STEPS = [0.9, 0.82, 0.72, 0.62, 0.5];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

const toBlob = (canvas: HTMLCanvasElement, q: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));

/**
 * ย่อรูปให้ด้านยาวไม่เกิน 2000px และขนาดไม่เกิน ~2 MB (JPEG)
 * ถอดรหัสรูปไม่ได้ (เช่น HEIC บนบางเครื่อง) → ส่งไฟล์เดิม ให้ server ตัดสินชนิดไฟล์
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#ffffff'; // PNG โปร่งใส → พื้นขาว (JPEG ไม่มีความโปร่งใส)
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let blob: Blob | null = null;
  for (const q of QUALITY_STEPS) {
    blob = await toBlob(canvas, q);
    if (!blob || blob.size <= IMAGE_TARGET_BYTES) break;
  }
  if (!blob) return file;
  // ไฟล์เดิมเล็กกว่าอยู่แล้ว → ใช้ไฟล์เดิม
  if (blob.size >= file.size && (file.type === 'image/jpeg' || file.type === 'image/png')) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
