import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type * as NextServer from 'next/server';
import type * as PhotoService from '@/lib/link-up/service';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  requireOrganizer: vi.fn(),
  adminSummary: vi.fn(),
  archivePhotos: vi.fn(),
  photoArchive: vi.fn(),
}));
vi.mock('@/lib/link-up/organizer', () => ({ requireOrganizer: mocks.requireOrganizer }));
vi.mock('@/lib/link-up/service', async (original) => ({
  ...(await original<typeof PhotoService>()),
  adminSummary: mocks.adminSummary,
}));
vi.mock('@/lib/link-up/archive', () => ({
  archivePhotos: mocks.archivePhotos,
  photoArchive: mocks.photoArchive,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof NextServer>()),
  after: vi.fn(),
}));
import { PageAccessError } from '@/lib/auth/page-access';
import { GET, PATCH, POST } from '@/app/api/events/admin/the-link-up/[...path]/route';
import { GET as exportPhotos } from '@/app/api/events/admin/the-link-up/export/route';

const base = 'http://localhost:3100/api/events/admin/the-link-up/';
beforeEach(() => vi.resetAllMocks());
describe('event admin API access', () => {
  it.each([
    ['GET', 'summary'],
    ['GET', 'gallery'],
    ['GET', 'photos/id/view'],
    ['GET', 'photos/id/download'],
    ['POST', 'photos/id/hide'],
    ['POST', 'photos/id/show'],
    ['POST', 'photos/id/delete'],
    ['POST', 'reports/id/review'],
    ['POST', 'cleanup'],
    ['PATCH', 'settings'],
  ])('rechecks access for %s %s under the new route', async (method, path) => {
    mocks.requireOrganizer.mockRejectedValue(
      new PageAccessError('forbidden', 'Access revoked', 403),
    );
    const handler = method === 'GET' ? GET : method === 'POST' ? POST : PATCH;
    const response = await handler(
      new NextRequest(base + path, {
        method,
        headers: { Origin: 'http://localhost:3100' },
      }),
      { params: Promise.resolve({ path: path.split('/') }) },
    );
    expect(response.status).toBe(403);
    expect(mocks.requireOrganizer).toHaveBeenCalledOnce();
    expect(mocks.adminSummary).not.toHaveBeenCalled();
  });
  it('retains the existing summary operation for an approved organizer', async () => {
    mocks.requireOrganizer.mockResolvedValue({ id: 'organizer' });
    mocks.adminSummary.mockResolvedValue({ counts: { published: 31, hidden: 1 } });
    const response = await GET(new NextRequest(base + 'summary'), {
      params: Promise.resolve({ path: ['summary'] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counts: { published: 31, hidden: 1 } });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each([401, 403, 503])(
    'protects both ZIP stages when authorization returns %i',
    async (status) => {
      mocks.requireOrganizer.mockRejectedValue(new PageAccessError('access', 'Denied', status));
      for (const suffix of ['export', 'export?download=1']) {
        const response = await exportPhotos(new NextRequest(base + suffix));
        expect(response.status).toBe(status);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
      }
      expect(mocks.archivePhotos).not.toHaveBeenCalled();
      expect(mocks.photoArchive).not.toHaveBeenCalled();
    },
  );
  it('checks access again between export preparation and downloading', async () => {
    mocks.requireOrganizer
      .mockResolvedValueOnce({ id: 'organizer' })
      .mockRejectedValueOnce(new PageAccessError('forbidden', 'Access revoked', 403));
    mocks.archivePhotos.mockResolvedValue([{ id: 'photo' }]);
    const response = await exportPhotos(new NextRequest(base + 'export'));
    expect(await response.json()).toEqual({
      url: '/api/events/admin/the-link-up/export?download=1',
    });
    expect((await exportPhotos(new NextRequest(base + 'export?download=1'))).status).toBe(403);
    expect(mocks.photoArchive).not.toHaveBeenCalled();
  });
});
