import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  eventConfig: vi.fn(),
  removeObject: vi.fn(),
}));
vi.mock('@/lib/link-up/database', () => ({
  photoDatabase: () => ({ from: mocks.from, rpc: mocks.rpc }),
  eventConfig: mocks.eventConfig,
}));
vi.mock('@/lib/link-up/r2', () => ({
  signedView: vi.fn().mockResolvedValue('https://album.test/photo.jpg'),
  removeObject: mocks.removeObject,
}));
import { adminSummary, cleanupObjects, gallery } from '@/lib/link-up/service';

function query(data: unknown[] = []) {
  return Object.assign(Promise.resolve({ data, error: null, count: data.length }), {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: 0, error: null });
  mocks.eventConfig.mockResolvedValue({ id: 'event', gallery_enabled: true, reserved_bytes: 0 });
});
describe('album dashboard queries', () => {
  it('expires abandoned upload holds before reading the dashboard totals', async () => {
    mocks.from.mockImplementation(() => query());
    await adminSummary();
    expect(mocks.rpc).toHaveBeenCalledWith('link_up_expire_uploads', {});
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.eventConfig.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it('fails closed if upload hold accounting cannot be refreshed', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(adminSummary()).rejects.toMatchObject({ status: 503 });
    expect(mocks.eventConfig).not.toHaveBeenCalled();
  });
  it('excludes photos whose files are being deleted from the admin gallery', async () => {
    const photos = query();
    mocks.from.mockReturnValue(photos);
    await gallery(null, true);
    expect(photos.in).toHaveBeenCalledWith('status', ['published', 'hidden']);
  });
  it('filters on the server so hidden photos can be found across all pages', async () => {
    const photos = query();
    mocks.from.mockReturnValue(photos);
    await gallery(null, true, 'hidden');
    expect(photos.eq).toHaveBeenCalledWith('status', 'hidden');
  });
  it('keeps the public gallery closed even if a cursor is provided', async () => {
    mocks.eventConfig.mockResolvedValue({ gallery_enabled: false });
    expect(await gallery('invalid-cursor')).toEqual({
      photos: [],
      nextCursor: null,
      galleryEnabled: false,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('bounds slow cleanup work and only acknowledges files actually removed', async () => {
    let now = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const outbox = query(
      Array.from({ length: 150 }, (_, index) => ({ object_key: String(index) })),
    );
    mocks.from.mockReturnValue(outbox);
    mocks.removeObject.mockImplementation(() => {
      now += 10_000;
      return Promise.resolve();
    });
    try {
      const result = await cleanupObjects(150);
      expect(result.removed).toBe(2);
      expect(outbox.delete).toHaveBeenCalledTimes(2);
      expect(mocks.rpc).toHaveBeenLastCalledWith('link_up_finalize_deletions', {});
    } finally {
      clock.mockRestore();
    }
  });
});
