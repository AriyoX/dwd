import { PHOTO_ADMIN_API, PHOTO_API } from './photo-contracts';

const CONNECTION_MESSAGE =
  'Could not connect. Check your connection, then refresh the page or try again.';

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
    const url = path.startsWith('admin/')
      ? `${PHOTO_ADMIN_API}/${path.slice('admin/'.length)}`
      : `${PHOTO_API}/${path}`;
    const response = await fetch(url, {
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
        error?.error ?? CONNECTION_MESSAGE,
        error?.code ?? 'unavailable',
        response.status,
      );
    }
    if (data === null) throw new PhotoApiError(CONNECTION_MESSAGE, 'unavailable', 503);
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
export function photoErrorMessage(error: unknown) {
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
    return 'This is taking too long. Check your connection, then refresh the page or try again.';
  if (error instanceof TypeError) return CONNECTION_MESSAGE;
  if (error instanceof PhotoApiError && error.status >= 500 && !error.message.includes('refresh'))
    return `${error.message} Check your connection and refresh the page if this continues.`;
  return error instanceof Error ? error.message : CONNECTION_MESSAGE;
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

export async function downloadPhotoArchive() {
  const { url } = await photoRequest<{ url: string }>('admin/export');
  const link = document.createElement('a');
  link.href = url;
  link.download = 'the-link-up-photos.zip';
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
              'Upload interrupted. Tap Retry. If it keeps failing, check your connection and refresh the page.',
              'put_failed',
              xhr.status,
            ),
          );
    xhr.onerror = () =>
      reject(
        new Error(
          'Upload could not connect. Check your connection and tap Retry, or refresh the page.',
        ),
      );
    xhr.ontimeout = () =>
      reject(
        new Error(
          'Upload took too long. Check your connection, then tap Retry or refresh the page.',
        ),
      );
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
