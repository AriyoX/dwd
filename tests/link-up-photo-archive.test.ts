import { Readable } from 'node:stream';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), eventConfig: vi.fn(), readPhotoObject: vi.fn() }));
vi.mock('@/lib/link-up/database', () => ({
  photoDatabase: () => ({ from: mocks.from }),
  eventConfig: mocks.eventConfig,
}));
vi.mock('@/lib/link-up/r2', () => ({ readPhotoObject: mocks.readPhotoObject }));
import { archivePhotos, photoArchive } from '@/lib/link-up/archive';

const photo = {
  id: '00000000-0000-4000-8000-000000000001',
  final_key: 'published/the-link-up/one.jpg',
  size_bytes: 5,
  status: 'published' as const,
  published_at: '2026-10-17T18:00:00Z',
};
function query(data: unknown[], error: unknown = null) {
  return Object.assign(Promise.resolve({ data, error }), {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.eventConfig.mockResolvedValue({ id: 'link-up', gallery_enabled: false });
});
describe('photo ZIP export', () => {
  it('paginates beyond the database row cap, scopes the event and includes hidden photos even with the gallery closed', async () => {
    const first = query(Array.from({ length: 500 }, (_, i) => ({ ...photo, id: String(i) })));
    const second = query([{ ...photo, status: 'hidden' }]);
    mocks.from.mockReturnValueOnce(first).mockReturnValueOnce(second);
    expect(await archivePhotos()).toHaveLength(501);
    expect(first.eq).toHaveBeenCalledWith('event_id', 'link-up');
    expect(first.in).toHaveBeenCalledWith('status', ['published', 'hidden']);
    expect(first.lte).toHaveBeenCalledWith('published_at', expect.any(String));
    expect(second.gt).toHaveBeenCalledWith('id', '499');
  });
  it('rejects an empty album and fails closed on a database error', async () => {
    mocks.from.mockReturnValueOnce(query([]));
    await expect(archivePhotos()).rejects.toMatchObject({ status: 409, code: 'no_photos' });
    mocks.from.mockReturnValueOnce(query([], { message: 'offline' }));
    await expect(archivePhotos()).rejects.toMatchObject({ status: 503 });
    expect(mocks.readPhotoObject).not.toHaveBeenCalled();
  });
  it('creates an extractable ZIP with complete visible and hidden photo bytes and a matching download length', async () => {
    mocks.readPhotoObject.mockImplementation(() =>
      Promise.resolve(Readable.from([Buffer.from('photo')])),
    );
    const response = await photoArchive(
      [
        photo,
        {
          ...photo,
          id: '00000000-0000-4000-8000-000000000002',
          final_key: 'hidden.jpg',
          status: 'hidden',
        },
      ],
      new AbortController().signal,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const extracted = unzipSync(bytes);
    expect(Object.keys(extracted)).toEqual([
      `photos/the-link-up-${photo.id}.jpg`,
      'hidden/the-link-up-00000000-0000-4000-8000-000000000002.jpg',
    ]);
    for (const file of Object.values(extracted)) expect(Buffer.from(file).toString()).toBe('photo');
    expect(response.headers.get('content-length')).toBe(String(bytes.length));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toBe('application/zip');
  });
  it('fails an interrupted storage read instead of finalizing an incomplete ZIP', async () => {
    mocks.readPhotoObject.mockRejectedValue(new Error('storage unavailable'));
    const response = await photoArchive([photo], new AbortController().signal);
    await expect(response.arrayBuffer()).rejects.toThrow('storage unavailable');
  });
  it('stops reading storage when the download is cancelled', async () => {
    const source = new Readable({ read() {} });
    mocks.readPhotoObject.mockResolvedValue(source);
    const controller = new AbortController();
    const response = await photoArchive([photo], controller.signal);
    const consuming = response.arrayBuffer();
    controller.abort();
    await expect(consuming).rejects.toThrow();
    await vi.waitFor(() => expect(source.destroyed).toBe(true));
  });
});
