import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));
const authMocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve({ auth: { getUser: authMocks.getUser } }),
}));
vi.mock('@/lib/link-up/database', () => ({ photoDatabase: () => ({ rpc: authMocks.rpc }) }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: authMocks.rpc }),
}));

import { readPhotoSession, signPhotoSession } from '@/lib/link-up/session';
import { normalizePhoto } from '@/lib/link-up/images';
import { verifyTurnstile, protectionStatus } from '@/lib/link-up/turnstile';
import { requireOrganizer, LINK_UP_ADMIN_PATH } from '@/lib/link-up/organizer';
import { requirePageAdmin } from '@/lib/auth/page-access';
import { signedUpload, signedView } from '@/lib/link-up/r2';
import { batchSchema, decodeCursor } from '@/lib/link-up/service';
import type { ReservationRow } from '@/features/events/photo-contracts';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('event-specific anonymous sessions', () => {
  const secret = 'a-long-random-test-secret-1234567890';
  const id = 'ea100000-0000-4000-8000-000000000001';
  it('validates signed, expiring cookies and rejects forgery', () => {
    const cookie = signPhotoSession(id, secret, 100000);
    expect(readPhotoSession(cookie, secret, 110000)).toBe(id);
    expect(readPhotoSession(cookie, 'another-secret', 110000)).toBeNull();
    expect(
      readPhotoSession(cookie.replace(id, 'ea100000-0000-4000-8000-000000000002'), secret, 110000),
    ).toBeNull();
    expect(readPhotoSession(cookie, secret, 100000 + 91 * 86400000)).toBeNull();
  });
});
describe('upload authorization protection', () => {
  function configure() {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site');
  }
  it('fails closed with missing production configuration even when local bypass is set', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('LINK_UP_ALLOW_LOCAL_TURNSTILE_BYPASS', 'true');
    expect(protectionStatus('localhost')).toBe('unavailable');
    await expect(verifyTurnstile('token', 'dwdug.vercel.app')).rejects.toMatchObject({
      code: 'turnstile_configuration',
    });
  });
  it('requires a token and validates the action and exact hostname server-side', async () => {
    configure();
    await expect(verifyTurnstile('', 'dwdug.vercel.app')).rejects.toMatchObject({
      code: 'turnstile_required',
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, hostname: 'dwdug.vercel.app', action: 'link-up-upload' }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    await verifyTurnstile('real-token', 'dwdug.vercel.app');
    expect(fetcher).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ secret: 'test-secret', response: 'real-token' }),
      }),
    );
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, hostname: 'attacker.example', action: 'link-up-upload' }),
      ),
    );
    await expect(verifyTurnstile('token', 'dwdug.vercel.app')).rejects.toMatchObject({
      code: 'turnstile_failed',
    });
  });
  it('rejects expired/replayed tokens and gives network failures a retryable error', async () => {
    configure();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] })),
    );
    await expect(verifyTurnstile('expired', 'dwdug.vercel.app')).rejects.toMatchObject({
      code: 'turnstile_failed',
    });
    fetcher.mockRejectedValue(new Error('offline'));
    await expect(verifyTurnstile('token', 'dwdug.vercel.app')).rejects.toMatchObject({
      code: 'turnstile_unavailable',
      status: 503,
    });
  });
  it('bounds the authorization payload to ten processed images and 2 MB each', () => {
    const file = {
      clientId: crypto.randomUUID(),
      fingerprint: 'a'.repeat(64),
      type: 'image/jpeg',
      size: 1000,
    };
    const batch = { batchId: crypto.randomUUID(), token: 'token', files: [file] };
    expect(batchSchema.safeParse(batch).success).toBe(true);
    expect(
      batchSchema.safeParse({ ...batch, files: Array.from({ length: 11 }, () => file) }).success,
    ).toBe(false);
    expect(batchSchema.safeParse({ ...batch, files: [{ ...file, size: 2097153 }] }).success).toBe(
      false,
    );
  });
});
describe('server image validation and sanitation', () => {
  it('decodes and re-encodes oriented images, discarding EXIF and location metadata', async () => {
    const image = await sharp({
      create: { width: 80, height: 40, channels: 3, background: '#7f9970' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Artist: 'Private camera' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '0/1 1/1 0/1' },
      })
      .toBuffer();
    const normalized = await normalizePhoto(image, 'image/jpeg');
    const metadata = await sharp(normalized.image).metadata();
    expect([normalized.width, normalized.height]).toEqual([40, 80]);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.format).toBe('jpeg');
    expect(normalized.thumbnail.length).toBeLessThan(131072);
  });
  it('rejects oversized, corrupt, disguised and excessive-dimension images', async () => {
    await expect(normalizePhoto(Buffer.alloc(2097153), 'image/jpeg')).rejects.toMatchObject({
      code: 'invalid_image',
    });
    await expect(normalizePhoto(Buffer.from('not an image'), 'image/jpeg')).rejects.toMatchObject({
      code: 'invalid_image',
    });
    const png = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await expect(normalizePhoto(png, 'image/jpeg')).rejects.toMatchObject({
      code: 'invalid_image',
    });
    const huge = await sharp({
      create: { width: 3000, height: 1, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    await expect(normalizePhoto(huge, 'image/jpeg')).rejects.toMatchObject({
      code: 'invalid_image',
    });
  });
  it('keeps larger previews sharp while respecting the thumbnail storage reservation', async () => {
    const width = 1200;
    const height = 900;
    const pixels = Buffer.alloc(width * height * 3);
    let seed = 42;
    for (let offset = 0; offset < pixels.length; offset++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[offset] = seed >>> 24;
    }
    const original = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 94 })
      .toBuffer();
    const normalized = await normalizePhoto(original, 'image/jpeg');
    const preview = await sharp(normalized.thumbnail).metadata();
    expect([normalized.width, normalized.height]).toEqual([width, height]);
    expect([preview.width, preview.height]).toEqual([640, 480]);
    expect(normalized.image.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(normalized.thumbnail.length).toBeLessThanOrEqual(128 * 1024);
    expect(preview.exif).toBeUndefined();
  });
  it('falls back to a smaller preview for noisy images instead of rejecting the photo', async () => {
    const pixels = Buffer.alloc(640 * 640 * 3);
    let seed = 42;
    for (let offset = 0; offset < pixels.length; offset++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[offset] = seed >>> 24;
    }
    const original = await sharp(pixels, { raw: { width: 640, height: 640, channels: 3 } })
      .jpeg({ quality: 94 })
      .toBuffer();
    const normalized = await normalizePhoto(original, 'image/jpeg');
    const preview = await sharp(normalized.thumbnail).metadata();
    expect([normalized.width, normalized.height]).toEqual([640, 640]);
    expect([preview.width, preview.height]).toEqual([480, 480]);
    expect(normalized.thumbnail.length).toBeLessThanOrEqual(128 * 1024);
  });
});
describe('private R2 URLs', () => {
  beforeEach(() => {
    vi.stubEnv('R2_ACCOUNT_ID', 'example');
    vi.stubEnv('R2_ENDPOINT', 'https://example.r2.cloudflarestorage.com');
    vi.stubEnv('R2_BUCKET_NAME', 'the-link-up-memories');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'test-access-key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret-key');
  });
  it('binds a five-minute PUT to the temporary object and Content-Type', async () => {
    const url = new URL(
      await signedUpload({
        temporary_key: 'temporary/the-link-up/random',
        content_type: 'image/jpeg',
      } as ReservationRow),
    );
    expect(url.origin).toBe('https://example.r2.cloudflarestorage.com');
    expect(url.pathname).toContain('/temporary/the-link-up/random');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.toString()).not.toContain('test-secret-key');
  });
  it('generates short-lived GET and attachment URLs without public bucket access', async () => {
    const url = new URL(
      await signedView('published/the-link-up/random/photo.jpg', 'the-link-up-test.jpg'),
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('response-content-disposition')).toContain('attachment');
    expect(url.searchParams.get('X-Amz-Signature')).toHaveLength(64);
  });
  it('rejects query-injection cursors', () => {
    expect(() =>
      decodeCursor(Buffer.from('{"at":"x),status.eq.hidden","id":"x"}').toString('base64url')),
    ).toThrow();
  });
});
describe('organizer authorization', () => {
  it.each(['shebatindy@gmail.com', 'ahumuzaariyo@gmail.com', ' ShebaTindy@GMAIL.com '])(
    'accepts the verified current identity %s',
    async (email) => {
      const user = {
        id: crypto.randomUUID(),
        email,
        email_confirmed_at: '2026-10-15T00:00:00Z',
        is_anonymous: false,
      };
      authMocks.getUser.mockResolvedValue({ data: { user }, error: null });
      authMocks.rpc.mockResolvedValue({ data: true, error: null });
      expect(await requireOrganizer()).toEqual(user);
      expect(authMocks.rpc).toHaveBeenCalledWith('has_page_admin_access', {
        p_user: user.id,
        p_page_path: LINK_UP_ADMIN_PATH,
      });
    },
  );
  it.each([
    { email: 'shebatindy@gmail.com', email_confirmed_at: undefined },
    {
      email: 'ahumuzaariyo@gmail.com',
      email_confirmed_at: '2026-10-15T00:00:00Z',
      is_anonymous: true,
    },
  ])('rejects unverified and anonymous users before looking up access', async (user) => {
    authMocks.getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(requireOrganizer()).rejects.toMatchObject({ status: 403 });
    expect(authMocks.rpc).not.toHaveBeenCalled();
  });
  it('requires an authenticated session and rejects revoked database access', async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    await expect(requireOrganizer()).rejects.toMatchObject({ status: 401 });
    authMocks.getUser.mockResolvedValue({
      data: { user: { id: 'id', email: 'shebatindy@gmail.com', email_confirmed_at: 'yes' } },
      error: null,
    });
    authMocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireOrganizer()).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a verified account without a page grant, ignoring editable metadata', async () => {
    authMocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'other',
          email: 'other@example.com',
          email_confirmed_at: 'yes',
          user_metadata: { admin: true },
        },
      },
      error: null,
    });
    authMocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireOrganizer()).rejects.toMatchObject({ status: 403 });
    expect(authMocks.rpc).toHaveBeenCalledWith('has_page_admin_access', {
      p_user: 'other',
      p_page_path: LINK_UP_ADMIN_PATH,
    });
  });
  it('checks each request and keeps permissions scoped to the exact page', async () => {
    authMocks.getUser.mockResolvedValue({
      data: { user: { id: 'id', email: 'shebatindy@gmail.com', email_confirmed_at: 'yes' } },
      error: null,
    });
    authMocks.rpc.mockImplementation((_name, args) =>
      Promise.resolve({ data: args.p_page_path === LINK_UP_ADMIN_PATH, error: null }),
    );
    await expect(requireOrganizer()).resolves.toMatchObject({ id: 'id' });
    await expect(requirePageAdmin('/events/another-event/admin')).rejects.toMatchObject({
      status: 403,
    });
    authMocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireOrganizer()).rejects.toMatchObject({ status: 403 });
    expect(authMocks.rpc).toHaveBeenCalledTimes(3);
  });
  it('fails closed when the access database is unavailable', async () => {
    authMocks.getUser.mockResolvedValue({
      data: { user: { id: 'id', email: 'shebatindy@gmail.com', email_confirmed_at: 'yes' } },
      error: null,
    });
    authMocks.rpc.mockResolvedValue({ data: null, error: new Error('database offline') });
    await expect(requireOrganizer()).rejects.toMatchObject({
      code: 'authorization_unavailable',
      status: 503,
    });
  });
  it.each([429, 500, 503, 0])(
    'reports Auth failure %s as unavailable instead of signing the user out',
    async (status) => {
      authMocks.getUser.mockResolvedValue({ data: { user: null }, error: { status } });
      await expect(requireOrganizer()).rejects.toMatchObject({
        code: 'authorization_unavailable',
        status: 503,
      });
      expect(authMocks.rpc).not.toHaveBeenCalled();
    },
  );
  it('fails closed when Auth throws a connection error', async () => {
    authMocks.getUser.mockRejectedValue(new TypeError('network failure'));
    await expect(requireOrganizer()).rejects.toMatchObject({ status: 503 });
    expect(authMocks.rpc).not.toHaveBeenCalled();
  });
});
