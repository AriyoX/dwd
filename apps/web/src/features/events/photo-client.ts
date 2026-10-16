import { PHOTO_API } from './photo-contracts';

export class PhotoApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function photoRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  // AbortSignal.timeout is newer than our supported Safari baseline.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException('Photo request timed out.', 'TimeoutError')),
    path.endsWith('/complete') || path === 'admin/cleanup' ? 65_000 : 30_000,
  );
  try {
    const response = await fetch(`${PHOTO_API}/${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      ...(options.body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
    // Proxies and interrupted deployments can return HTML or an empty response.
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = data as { error?: string; code?: string } | null;
      throw new PhotoApiError(
        error?.error ?? 'The album could not connect. Please try again.',
        error?.code ?? 'unavailable',
        response.status,
      );
    }
    if (data === null)
      throw new PhotoApiError('The album could not connect. Please try again.', 'unavailable', 503);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
export function photoErrorMessage(error: unknown) {
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
    return 'This is taking too long. Check your connection and try again.';
  if (error instanceof TypeError) return 'Could not connect. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Could not connect. Please retry.';
}
export async function downloadPhoto(id: string, admin = false) {
  const result = await photoRequest<{ url: string }>(
    `${admin ? 'admin/' : ''}photos/${id}/download`,
  );
  const link = document.createElement('a');
  link.href = result.url;
  link.rel = 'noreferrer';
  link.download = `the-link-up-${id}.jpg`;
  document.body.append(link);
  link.click();
  link.remove();
}

export function directPhotoUpload(url: string, blob: Blob, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', blob.type);
    xhr.timeout = 240_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new PhotoApiError(
              'Upload interrupted. Tap Retry to get a fresh upload link.',
              'put_failed',
              xhr.status,
            ),
          );
    xhr.onerror = () =>
      reject(new Error('Upload could not connect. Check your connection and tap Retry.'));
    xhr.ontimeout = () =>
      reject(new Error('Upload took too long. Tap Retry when your connection improves.'));
    xhr.send(blob);
  });
}

// Coordinate the three upload slots across tabs on browsers with Web Locks.
// The uploader also bounds its workers to three when Web Locks is unavailable.
export async function withPhotoUploadSlot(work: () => Promise<void>) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Web Locks is absent in older mobile browsers despite the DOM typings.
  if (!navigator.locks) return work();
  for (let slot = 0; slot < 3; slot++) {
    const acquired = await navigator.locks.request(
      `dwd-link-up-upload-${slot}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return false;
        await work();
        return true;
      },
    );
    if (acquired) return;
  }
  await navigator.locks.request('dwd-link-up-upload-0', work);
}
