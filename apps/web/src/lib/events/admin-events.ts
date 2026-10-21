import 'server-only';
import { PageAccessError, requirePageAdmin } from '@/lib/auth/page-access';
import { LINK_UP_ADMIN_PATH } from '@/lib/link-up/organizer';
import { eventConfig, photoDatabase } from '@/lib/link-up/database';
import { databaseError } from '@/lib/link-up/errors';

export const EVENTS_ADMIN_PATH = '/events/admin';

// Register an event here once its dashboard and protected API are implemented.
const adminEvents = [{ title: 'The Link Up', path: LINK_UP_ADMIN_PATH }];

export async function accessibleAdminEvents() {
  // Portal membership is independent of permission to manage a particular event.
  const user = await requirePageAdmin(EVENTS_ADMIN_PATH);
  const events = await Promise.all(
    adminEvents.map(async (event) => {
      try {
        await requirePageAdmin(event.path);
      } catch (error) {
        if (error instanceof PageAccessError && error.status === 403) return null;
        throw error;
      }
      const config = await eventConfig();
      const counts = await Promise.all(
        (['published', 'hidden'] as const).map((status) =>
          photoDatabase()
            .from('event_photos')
            .select('id', { head: true, count: 'exact' })
            .eq('event_id', config.id)
            .eq('status', status),
        ),
      );
      for (const result of counts) if (result.error) databaseError(result.error);
      return {
        ...event,
        date: config.event_date,
        uploadsEnabled: config.uploads_enabled,
        galleryEnabled: config.gallery_enabled,
        visiblePhotos: counts[0]?.count ?? 0,
        hiddenPhotos: counts[1]?.count ?? 0,
      };
    }),
  );
  return { user, events: events.filter((event) => event !== null) };
}
