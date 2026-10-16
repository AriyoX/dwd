import 'server-only';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import { MAX_PHOTO_BYTES } from '@/features/events/photo-contracts';
import type { ReservationRow } from '@/features/events/photo-contracts';
import { PhotoError } from './errors';

export function r2Config() {
  const account = process.env['R2_ACCOUNT_ID'];
  const endpoint =
    process.env['R2_ENDPOINT'] || (account ? `https://${account}.r2.cloudflarestorage.com` : '');
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  const bucket = process.env['R2_BUCKET_NAME'];
  if (!endpoint || !accessKeyId || !secretAccessKey || bucket !== 'the-link-up-memories') {
    throw new PhotoError('r2_configuration', 'Photo storage is not configured yet.', 503);
  }
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.r2.cloudflarestorage.com') ||
    url.username ||
    url.password ||
    !['', '/'].includes(url.pathname)
  ) {
    throw new PhotoError('r2_configuration', 'The photo storage endpoint is invalid.', 503);
  }
  return { endpoint: url.origin, accessKeyId, secretAccessKey, bucket };
}
let cachedStorage: { config: string; bucket: string; client: S3Client } | undefined;
function storage() {
  const { endpoint, accessKeyId, secretAccessKey, bucket } = r2Config();
  const config = JSON.stringify([endpoint, accessKeyId, secretAccessKey, bucket]);
  if (cachedStorage?.config === config) return cachedStorage;
  cachedStorage?.client.destroy();
  cachedStorage = {
    config,
    bucket,
    client: new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
  };
  return cachedStorage;
}
export async function signedUpload(r: ReservationRow) {
  const { client, bucket } = storage();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: r.temporary_key, ContentType: r.content_type }),
    {
      expiresIn: 300,
      signableHeaders: new Set(['content-type']),
    },
  );
}
export async function signedView(key: string, downloadName?: string) {
  const { client, bucket } = storage();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(downloadName
        ? { ResponseContentDisposition: `attachment; filename="${downloadName}"` }
        : {}),
      ResponseCacheControl: 'private, no-store',
    }),
    { expiresIn: 120 },
  );
}
export async function readStaged(r: ReservationRow) {
  const { client, bucket } = storage();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: r.temporary_key }), {
    abortSignal: AbortSignal.timeout(15_000),
  });
  if (
    !head.ContentLength ||
    head.ContentLength > MAX_PHOTO_BYTES ||
    head.ContentLength !== r.expected_bytes ||
    head.ContentType !== r.content_type
  ) {
    throw new PhotoError(
      'invalid_image',
      'The uploaded photo has an invalid size or format. Choose it again.',
    );
  }
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: r.temporary_key }), {
    abortSignal: AbortSignal.timeout(20_000),
  });
  if (!object.Body) throw new Error('Missing staged object');
  const reader = (object.Body.transformToWebStream() as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PHOTO_BYTES)
        throw new PhotoError('invalid_image', 'The uploaded photo is larger than 2 MB.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = Buffer.concat(chunks);
  if (
    bytes.length !== r.expected_bytes ||
    createHash('sha256').update(bytes).digest('hex') !== r.fingerprint
  ) {
    throw new PhotoError(
      'invalid_image',
      'The uploaded photo changed or was interrupted. Choose it again.',
    );
  }
  return bytes;
}
export async function storeImage(key: string, bytes: Buffer) {
  const { client, bucket } = storage();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: 'image/jpeg',
      CacheControl: 'private, no-store',
    }),
    { abortSignal: AbortSignal.timeout(20_000) },
  );
}
export async function removeObject(key: string) {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
    abortSignal: AbortSignal.timeout(10_000),
  });
}
