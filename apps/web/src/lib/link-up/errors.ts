export class PhotoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}
const messages: Record<string, [number, string]> = {
  uploads_paused: [409, 'Photo uploads are paused. Please try again later.'],
  session_quota: [409, 'This browser has reached its photo limit.'],
  storage_quota: [409, 'The album is full. Please contact an organizer.'],
  invalid_batch: [400, 'Choose up to 10 supported photos.'],
  batch_changed: [409, 'This upload batch changed. Choose your photos again.'],
  reservation_expired: [410, 'This upload expired. Start a new batch to try again.'],
  renewal_limit: [429, 'This upload has been retried too often. Start a new batch.'],
  verification_busy: [409, 'This photo is being verified. Retry in a moment.'],
  upload_not_found: [404, 'This upload is unavailable in this browser.'],
  photo_not_found: [404, 'This photo is no longer available.'],
  lease_lost: [409, 'Verification was interrupted. Please retry.'],
};
export function databaseError(error: { message: string }): never {
  for (const [code, [status, message]] of Object.entries(messages)) {
    if (error.message.includes(code)) throw new PhotoError(code, message, status);
  }
  // Provider details and SQL are intentionally kept out of public responses.
  console.error('[link-up] database request failed');
  throw new PhotoError(
    'database_unavailable',
    'The album is temporarily unavailable. Please retry.',
    503,
  );
}
