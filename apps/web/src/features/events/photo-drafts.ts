export interface PhotoDraft {
  clientId: string;
  name: string;
  blob?: Blob;
  fingerprint?: string;
  width?: number;
  height?: number;
  size?: number;
  reservationId?: string;
  staged?: boolean;
  batchId?: string;
  state: 'preparing' | 'ready' | 'uploading' | 'verifying' | 'complete' | 'failed';
  error?: string;
  permanent?: boolean;
}
const DB_NAME = 'dwd-link-up-photo-drafts';
type StoredPhotoDraft = Omit<PhotoDraft, 'blob'> & {
  // Read existing Blob-based drafts, but write bytes for WebKit compatibility.
  blob?: Blob;
  bytes?: ArrayBuffer;
  contentType?: string;
};
const photoBytes = new WeakMap<Blob, Promise<ArrayBuffer>>();
async function openDrafts() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Local photo recovery is unavailable.'));
  });
}
export async function readPhotoDrafts(): Promise<PhotoDraft[]> {
  const db = await openDrafts();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get('batch');
      request.onsuccess = () => {
        try {
          const stored = (request.result as StoredPhotoDraft[] | undefined) ?? [];
          resolve(
            stored
              .map(({ bytes, contentType, ...draft }): PhotoDraft => ({
                ...draft,
                ...(draft.blob
                  ? {}
                  : bytes
                    ? { blob: new Blob([bytes], { type: contentType ?? 'image/jpeg' }) }
                    : {}),
                state:
                  draft.state === 'complete' ? 'complete' : draft.permanent ? 'failed' : 'ready',
              }))
              .filter((draft) => draft.blob || draft.state === 'complete'),
          );
        } catch {
          reject(new Error('Could not restore photo drafts.'));
        }
      };
      request.onerror = () => reject(request.error ?? new Error('Could not restore photo drafts.'));
    });
  } finally {
    db.close();
  }
}
export async function savePhotoDrafts(drafts: PhotoDraft[]) {
  const stored: StoredPhotoDraft[] = await Promise.all(
    drafts.map(async ({ blob, ...draft }) => {
      if (!blob) return draft;
      let bytes = photoBytes.get(blob);
      if (!bytes) {
        bytes = blob.arrayBuffer();
        photoBytes.set(blob, bytes);
      }
      return { ...draft, bytes: await bytes, contentType: blob.type };
    }),
  );
  const db = await openDrafts();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(stored, 'batch');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not save photo drafts.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Could not save photo drafts.'));
    });
  } finally {
    db.close();
  }
}
