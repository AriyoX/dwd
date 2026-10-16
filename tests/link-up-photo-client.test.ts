import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoApiError, photoErrorMessage, photoRequest } from '@/features/events/photo-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('album connection recovery', () => {
  it('loads on browsers without AbortSignal.timeout and releases its timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('AbortSignal', {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ photos: [] })));
    expect(await photoRequest('gallery')).toEqual({ photos: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    ['gallery', 30_000],
    ['uploads/photo/complete', 65_000],
    ['admin/cleanup', 65_000],
  ] as const)('aborts a stalled %s request after %i ms', async (path, duration) => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Timed out', 'TimeoutError')),
          );
        });
      }),
    );
    const request = photoRequest(path);
    const rejected = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(duration - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('turns a proxy HTML response into a useful retryable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Unavailable</html>', { status: 502 })),
    );
    await expect(photoRequest('gallery')).rejects.toMatchObject({
      code: 'unavailable',
      status: 502,
      message: expect.stringContaining('try again'),
    });
  });
  it('rejects empty successful responses rather than passing null to the gallery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')));
    await expect(photoRequest('gallery')).rejects.toBeInstanceOf(PhotoApiError);
  });
  it('keeps authorization failures identifiable so private photos can be cleared', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: 'Access revoked', code: 'forbidden' }, { status: 403 }),
        ),
    );
    await expect(photoRequest('admin/gallery')).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
  });
  it('gives connection and timeout errors a recovery instruction', () => {
    expect(photoErrorMessage(new DOMException('timed out', 'TimeoutError'))).toContain('try again');
    expect(photoErrorMessage(new TypeError('Failed to fetch'))).toContain('Check your connection');
  });
});
