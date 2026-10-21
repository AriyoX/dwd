import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PageAccess from '@/lib/auth/page-access';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  requirePageAdmin: vi.fn(),
  eventConfig: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@/lib/link-up/database', () => ({
  eventConfig: mocks.eventConfig,
  photoDatabase: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/auth/page-access', async (original) => ({
  ...(await original<typeof PageAccess>()),
  requirePageAdmin: mocks.requirePageAdmin,
}));
import { accessibleAdminEvents } from '@/lib/events/admin-events';
import { PageAccessError } from '@/lib/auth/page-access';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePageAdmin.mockResolvedValue({ id: 'organizer', email: 'admin@example.test' });
  mocks.eventConfig.mockResolvedValue({
    id: 'event',
    event_date: '2026-10-17',
    uploads_enabled: true,
    gallery_enabled: false,
  });
  mocks.from.mockImplementation(() =>
    Object.assign(Promise.resolve({ count: 2, error: null }), {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }),
  );
});
describe('events admin portal', () => {
  it('lists only dashboards granted to the current identity', async () => {
    const result = await accessibleAdminEvents();
    expect(result.user.email).toBe('admin@example.test');
    expect(result.events).toEqual([
      {
        title: 'The Link Up',
        path: '/events/admin/the-link-up',
        date: '2026-10-17',
        uploadsEnabled: true,
        galleryEnabled: false,
        visiblePhotos: 2,
        hiddenPhotos: 2,
      },
    ]);
    expect(mocks.requirePageAdmin).toHaveBeenNthCalledWith(1, '/events/admin');
    expect(mocks.requirePageAdmin).toHaveBeenCalledWith('/events/admin/the-link-up');
  });
  it('blocks portal entry before listing events for an account with no portal grant', async () => {
    mocks.requirePageAdmin.mockRejectedValue(new PageAccessError('forbidden', 'Denied', 403));
    await expect(accessibleAdminEvents()).rejects.toMatchObject({ status: 403 });
    expect(mocks.requirePageAdmin).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('lets a portal member see only their assigned events', async () => {
    mocks.requirePageAdmin
      .mockResolvedValueOnce({ id: 'portal-member' })
      .mockRejectedValueOnce(new PageAccessError('forbidden', 'Denied', 403));
    expect((await accessibleAdminEvents()).events).toEqual([]);
    expect(mocks.eventConfig).not.toHaveBeenCalled();
  });
  it.each([401, 503])(
    'keeps authentication and availability errors (%i) identifiable',
    async (status) => {
      mocks.requirePageAdmin.mockRejectedValue(
        new PageAccessError('access', 'Unavailable', status),
      );
      await expect(accessibleAdminEvents()).rejects.toMatchObject({ status });
    },
  );
});
