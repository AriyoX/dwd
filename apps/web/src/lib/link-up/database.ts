import 'server-only';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type {
  EventRow,
  PhotoRow,
  ReportRow,
  ReservationRow,
} from '@/features/events/photo-contracts';
import { PhotoError, databaseError } from './errors';

type Table<Row> = {
  Row: { [Key in keyof Row]: Row[Key] };
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Rpc<Args, Returns> = { Args: Args; Returns: Returns };
interface PhotoDatabase {
  public: {
    Tables: {
      photo_events: Table<EventRow>;
      photo_guest_sessions: Table<{
        id: string;
        event_id: string;
        published_count: number;
        created_at: string;
        last_seen_at: string;
      }>;
      photo_upload_reservations: Table<ReservationRow>;
      event_photos: Table<PhotoRow>;
      photo_reports: Table<ReportRow>;
      photo_event_organizers: Table<{
        event_id: string;
        user_id: string;
        role: string;
        created_at: string;
      }>;
      photo_object_cleanup: Table<{ object_key: string; not_before: string; created_at: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      link_up_rate_limit: Rpc<
        { p_session: string; p_action: string; p_limit: number; p_seconds: number },
        boolean
      >;
      link_up_expire_uploads: Rpc<Record<string, never>, number>;
      link_up_reserve: Rpc<{ p_session: string; p_batch: string; p_files: Json }, ReservationRow[]>;
      link_up_cancel: Rpc<{ p_session: string; p_ids: string[] }, number>;
      link_up_upload_url: Rpc<{ p_session: string; p_id: string }, ReservationRow>;
      link_up_claim: Rpc<{ p_session: string; p_id: string; p_lease: string }, ReservationRow>;
      link_up_finish: Rpc<
        {
          p_id: string;
          p_lease: string;
          p_size: number;
          p_thumb_size: number;
          p_width: number;
          p_height: number;
        },
        string
      >;
      link_up_fail: Rpc<
        { p_id: string; p_lease: string; p_code: string; p_permanent: boolean },
        undefined
      >;
      link_up_moderate: Rpc<{ p_id: string; p_action: string }, undefined>;
      link_up_finalize_deletions: Rpc<Record<string, never>, number>;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
export function photoDatabase() {
  try {
    return createServiceSupabaseClient<PhotoDatabase>();
  } catch {
    throw new PhotoError('configuration', 'Photo sharing is not configured yet.', 503);
  }
}
export async function eventConfig() {
  const { data, error } = await photoDatabase()
    .from('photo_events')
    .select('*')
    .eq('slug', 'the-link-up')
    .single();
  if (error) databaseError(error);
  return data;
}
export async function rateLimit(session: string, action: string, limit: number, seconds = 600) {
  const { data, error } = await photoDatabase().rpc('link_up_rate_limit', {
    p_session: session,
    p_action: action,
    p_limit: limit,
    p_seconds: seconds,
  });
  if (error) databaseError(error);
  if (!data)
    throw new PhotoError(
      'rate_limit',
      'Too many requests. Please wait a few minutes and retry.',
      429,
    );
}
