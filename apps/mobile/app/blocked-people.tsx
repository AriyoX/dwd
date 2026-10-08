import { BlockedUsers } from '@/components/blocked-users';
import { Screen, ScreenHeading } from '@/components/screen';
import { useSupabase } from '@/providers/supabase-provider';

export default function BlockedPeopleScreen() {
  const { session } = useSupabase();
  return (
    <Screen insetTop={false}>
      <ScreenHeading title="Blocked people" />
      {session ? <BlockedUsers key={session.user.id} /> : null}
    </Screen>
  );
}
