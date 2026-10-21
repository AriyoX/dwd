import 'server-only';
import { requirePageAdmin } from '@/lib/auth/page-access';

export const LINK_UP_ADMIN_PATH = '/events/admin/the-link-up';
export function requireOrganizer() {
  return requirePageAdmin(LINK_UP_ADMIN_PATH);
}
