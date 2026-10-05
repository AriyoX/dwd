import { nightDraftKey } from './night-draft';
import { supportDraftKey } from './support-draft';
import { pushPreferenceKey, pushRegistrationKey } from './native-notifications';

// Remove only this actor's product data after they confirm account deletion.
// Supabase owns session storage; appearance and the installation identity are device settings.
export function clearDeletedAccountData(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'>,
  owner: string,
) {
  const exact = new Set([
    nightDraftKey(owner),
    supportDraftKey(owner),
    pushPreferenceKey(owner),
    pushRegistrationKey(owner),
    `dwd.mobile.pending-logs.v1:${owner}`,
    `dwd.mobile.tour.v1:${owner}`,
  ]);
  const prefixes = [
    `dwd.mobile.cache.v1:${owner}:`,
    `dwd.mobile.invite.v1:${owner}:`,
    `dwd.mobile.planned-end.v1:${owner}:`,
    `dwd.mobile.photo-task.v1:${owner}:`,
  ];
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys)
    if (key && (exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix))))
      storage.removeItem(key);
}
