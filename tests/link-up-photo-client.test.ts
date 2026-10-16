import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoApiError, photoErrorMessage, photoRequest } from '@/features/events/photo-client';

afterEach(() => vi.unstubAllGlobals());
describe('album connection recovery', () => {
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
