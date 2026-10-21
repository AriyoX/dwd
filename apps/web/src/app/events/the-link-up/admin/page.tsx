import { redirect } from 'next/navigation';
import { LINK_UP_ADMIN_PATH } from '@/lib/link-up/organizer';

export default function LegacyOrganizerPage() {
  redirect(LINK_UP_ADMIN_PATH);
}
