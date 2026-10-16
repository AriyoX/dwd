export const PHOTO_API = '/api/events/the-link-up';
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 128 * 1024;
export const MAX_PHOTO_EDGE = 2048;
export const MAX_BATCH = 10;
export const MAX_PARALLEL_UPLOADS = 3;
export const TURNSTILE_ACTION = 'link-up-upload';

export interface GalleryPhoto {
  id: string;
  width: number;
  height: number;
  publishedAt: string;
  thumbnailUrl: string;
  imageUrl: string;
  expiresAt: number;
  status?: string;
}
export interface GalleryPage {
  photos: GalleryPhoto[];
  nextCursor: string | null;
  galleryEnabled: boolean;
}
export interface UploadTicket {
  id: string;
  clientId: string;
  status: string;
}
export interface SessionStatus {
  uploadsEnabled: boolean;
  galleryEnabled: boolean;
  remaining: number;
  batchLimit: number;
  protection: 'turnstile' | 'local-bypass' | 'unavailable';
  recentUploads: UploadTicket[];
}
export interface EventRow {
  id: string;
  slug: string;
  title: string;
  event_date: string;
  uploads_enabled: boolean;
  gallery_enabled: boolean;
  storage_budget_bytes: number;
  used_bytes: number;
  reserved_bytes: number;
  session_photo_limit: number;
  batch_limit: number;
  upload_error_count: number;
  created_at: string;
  updated_at: string;
}
export interface ReservationRow {
  id: string;
  event_id: string;
  session_id: string;
  batch_id: string;
  client_id: string;
  fingerprint: string;
  content_type: 'image/jpeg' | 'image/png' | 'image/webp';
  expected_bytes: number;
  reserved_bytes: number;
  temporary_key: string;
  final_key: string;
  thumbnail_key: string;
  status: 'pending' | 'verifying' | 'completed' | 'rejected' | 'expired';
  expires_at: string;
  url_expires_at: string | null;
  renewal_count: number;
  lease_token: string | null;
  lease_until: string | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}
export interface PhotoRow {
  id: string;
  event_id: string;
  session_id: string;
  final_key: string;
  thumbnail_key: string;
  content_type: string;
  size_bytes: number;
  thumbnail_bytes: number;
  width: number;
  height: number;
  status: 'published' | 'hidden' | 'deleting' | 'deleted';
  published_at: string;
  hidden_at: string | null;
  deleted_at: string | null;
}
export interface ReportRow {
  id: string;
  photo_id: string;
  session_id: string;
  reason: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}
export interface AdminSummary {
  event: Pick<
    EventRow,
    | 'uploads_enabled'
    | 'gallery_enabled'
    | 'used_bytes'
    | 'reserved_bytes'
    | 'storage_budget_bytes'
    | 'upload_error_count'
    | 'session_photo_limit'
    | 'batch_limit'
  >;
  counts: Record<string, number>;
  reports: Pick<ReportRow, 'id' | 'photo_id' | 'reason' | 'status' | 'created_at'>[];
  errors: { id: string; error_code: string | null; status: string; created_at: string }[];
}

export interface CleanupResult {
  expired: number;
  removed: number;
  deleted: number;
}
