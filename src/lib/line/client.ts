import type { LineApi, LineContent, LineMessage } from './types';

const API = 'https://api.line.me/v2/bot/message';
const DATA_API = 'https://api-data.line.me/v2/bot/message';
const RETRY_DELAYS_MS = [300, 800];
/**
 * เวลารอต่อครั้งของ reply/push (ข้อความเล็ก ปกติไม่ถึง 1 วินาที)
 * ค่าเริ่มต้นของ Node รอเชื่อมต่อถึง 10 วินาที — บนเครือข่ายที่ packet หายบางครั้ง
 * ตัดเร็วแล้วเปิดการเชื่อมต่อใหม่ได้ผลเร็วกว่ารอ
 */
const MESSAGE_TIMEOUT_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** สาเหตุจริงของ "fetch failed" (เช่น ECONNRESET, UND_ERR_CONNECT_TIMEOUT) */
export function describeFetchError(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const cause = e?.cause ? ` (${e.cause.code ?? ''} ${e.cause.message ?? ''})`.replace('( ', '(') : '';
  return `${e?.message ?? String(err)}${cause}`;
}

/**
 * fetch ที่ลองใหม่เมื่อเครือข่ายล้ม (ต่อไม่ติด / หลุดกลางทาง) — ไม่ลองใหม่เมื่อ LINE ตอบ HTTP error กลับมา
 * - reply: ลองซ้ำได้ปลอดภัย reply token ใช้ได้ครั้งเดียว ถ้าครั้งแรกถึง LINE แล้ว ครั้งต่อไปจะได้ 400 ไม่ส่งซ้ำ
 * - push: ส่ง X-Line-Retry-Key เดียวกันทุกครั้ง LINE จะไม่ส่งข้อความซ้ำ
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  delays: number[] = RETRY_DELAYS_MS,
  timeoutMs?: number,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, timeoutMs ? { ...init, signal: AbortSignal.timeout(timeoutMs) } : init);
    } catch (err) {
      if (attempt >= delays.length) throw err;
      console.warn(`[line] network error, retry ${attempt + 1}/${delays.length}:`, describeFetchError(err));
      await sleep(delays[attempt]);
    }
  }
}

/** LINE Messaging API ผ่าน fetch ตรงๆ (ไม่ต้องพึ่ง SDK) */
export function createLineClient(channelAccessToken: string, retryDelays: number[] = RETRY_DELAYS_MS): LineApi {
  const auth = { Authorization: `Bearer ${channelAccessToken}` };

  async function post(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
    return fetchWithRetry(
      `${API}/${path}`,
      {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify(body),
      },
      retryDelays,
      MESSAGE_TIMEOUT_MS,
    );
  }

  return {
    async reply(replyToken: string, messages: LineMessage[]) {
      if (!replyToken || messages.length === 0) return;
      const res = await post('reply', { replyToken, messages: messages.slice(0, 5) });
      if (!res.ok) {
        console.error('[line] reply failed', res.status, await res.text().catch(() => ''));
      }
    },

    async push(to: string, messages: LineMessage[]) {
      if (!to || messages.length === 0) return false;
      const res = await post('push', { to, messages: messages.slice(0, 5) }, { 'X-Line-Retry-Key': crypto.randomUUID() });
      // 409 = retry key นี้ถูกส่งสำเร็จไปแล้ว (ครั้งก่อนถึง LINE แต่คำตอบหลุดระหว่างทาง)
      if (res.status === 409) return true;
      if (!res.ok) {
        console.error('[line] push failed', res.status, await res.text().catch(() => ''));
      }
      return res.ok;
    },

    async getContent(messageId: string): Promise<LineContent | null> {
      const res = await fetchWithRetry(
        `${DATA_API}/${encodeURIComponent(messageId)}/content`,
        { headers: auth },
        retryDelays,
      );
      if (!res.ok) {
        console.error('[line] getContent failed', res.status);
        return null;
      }
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      };
    },
  };
}
