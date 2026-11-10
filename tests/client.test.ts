import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLineClient, describeFetchError } from '@/lib/line/client';

const networkError = () =>
  Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET', message: 'socket hang up' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LINE client', () => {
  it('เครือข่ายล้มครั้งแรก → ลองใหม่แล้วส่ง reply สำเร็จ', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await createLineClient('t', [0, 0]).reply('r', [{ type: 'text', text: 'hi' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reply ใส่ timeout ต่อครั้ง (ไม่รอ 10 วินาทีตามค่าเริ่มต้นของ Node)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await createLineClient('t', [0, 0]).reply('r', [{ type: 'text', text: 'hi' }]);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('LINE ตอบ HTTP error → ไม่ลองซ้ำ', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await createLineClient('t', [0, 0]).reply('r', [{ type: 'text', text: 'hi' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('push ลองซ้ำด้วย X-Line-Retry-Key เดิม และถือว่า 409 = ส่งแล้ว', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(new Response('', { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);

    const ok = await createLineClient('t', [0, 0]).push('U1', [{ type: 'text', text: 'hi' }]);
    expect(ok).toBe(true);
    const keys = fetchMock.mock.calls.map(([, init]) => (init.headers as Record<string, string>)['X-Line-Retry-Key']);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('ล้มครบทุกครั้ง → โยน error ออกไป', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError()));
    await expect(createLineClient('t', [0, 0]).reply('r', [{ type: 'text', text: 'hi' }])).rejects.toThrow('fetch failed');
  });

  it('describeFetchError แสดงสาเหตุจริง', () => {
    expect(describeFetchError(networkError())).toBe('fetch failed (ECONNRESET socket hang up)');
  });
});
