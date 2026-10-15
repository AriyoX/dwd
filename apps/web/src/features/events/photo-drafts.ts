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
      request.onsuccess = () =>
        resolve(
          ((request.result as PhotoDraft[] | undefined) ?? [])
            .filter((d) => d.blob || d.state === 'complete')
            .map((d) => ({ ...d, state: d.state === 'complete' ? 'complete' : 'ready' })),
        );
      request.onerror = () => reject(request.error ?? new Error('Could not restore photo drafts.'));
    });
  } finally {
    db.close();
  }
}
export async function savePhotoDrafts(drafts: PhotoDraft[]) {
  const db = await openDrafts();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(drafts, 'batch');
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
