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
  session_quota: [409, 'You’ve reached the photo limit for this event.'],
  storage_quota: [409, 'The album is full. Please contact an organizer.'],
  invalid_batch: [400, 'Choose up to 10 supported photos.'],
  batch_changed: [409, 'Your selection changed. Choose your photos again.'],
  reservation_expired: [410, 'This upload expired. Choose the photo again to share it.'],
  renewal_limit: [429, 'Please choose this photo again to restart the upload.'],
  verification_busy: [409, 'This photo is still being checked. Try again in a moment.'],
  upload_not_found: [404, 'This upload is no longer available. Choose the photo again.'],
  photo_not_found: [404, 'This photo is no longer available.'],
  invalid_photo_action: [409, 'This photo has changed. Refresh the album and try again.'],
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
