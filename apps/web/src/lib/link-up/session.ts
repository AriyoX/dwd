import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { PhotoError } from './errors';

const COOKIE = 'dwd-link-up-guest';
const LIFETIME = 90 * 24 * 60 * 60;
function signature(value: string, secret: string) {
  return createHmac('sha256', secret).update(`the-link-up:${value}`).digest('base64url');
}
export function signPhotoSession(id: string, secret: string, now = Date.now()) {
  const value = `${id}.${Math.floor(now / 1000) + LIFETIME}`;
  return `${value}.${signature(value, secret)}`;
}
export function readPhotoSession(
  cookie: string | undefined,
  secret: string,
  now = Date.now(),
): string | null {
  if (!cookie || cookie.length > 160) return null;
  const [id, expiry, mac, extra] = cookie.split('.');
  if (
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
    !expiry ||
    !mac ||
    extra
  )
    return null;
  const expires = Number(expiry);
  if (
    !Number.isSafeInteger(expires) ||
    expires <= now / 1000 ||
    expires > now / 1000 + LIFETIME + 60
  )
    return null;
  const expected = Buffer.from(signature(`${id}.${expiry}`, secret));
  const actual = Buffer.from(mac);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
}
export async function guestSession(create = false) {
  const secret = process.env['LINK_UP_SESSION_SECRET'];
  if (!secret || secret.length < 32)
    throw new PhotoError('configuration', 'Photo sessions are not configured yet.', 503);
  const jar = await cookies();
  const existing = readPhotoSession(jar.get(COOKIE)?.value, secret);
  if (existing) return existing;
  if (!create)
    throw new PhotoError(
      'session_required',
      'Start an upload in this browser first. Cookies must be enabled.',
      401,
    );
  const id = randomUUID();
  jar.set(COOKIE, signPhotoSession(id, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/events/the-link-up',
    maxAge: LIFETIME,
  });
  return id;
}
