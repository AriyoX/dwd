import { getBlockedUsers, unblockUser } from '@dwd/data';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useNightAction } from '@/hooks/use-night-action';
import { useSupabase } from '@/providers/supabase-provider';
import { actorClient } from '@/lib/actor-client';
import { Notice, LoadingPanel } from './screen';
import { Disclosure } from './disclosure';
import { PrimaryButton } from './primary-button';
export function BlockedUsers() {
  const query = useAccountQuery(getBlockedUsers);
  const action = useNightAction(query.refresh);
  const { client, session } = useSupabase();
  return (
    <Disclosure
      title="Blocked people"
      detail={query.data ? (query.data.length ? String(query.data.length) : 'None') : ''}
    >
      {!query.data && !query.issue ? <LoadingPanel /> : null}
      {query.data?.length === 0 ? <Notice message="No blocked people." /> : null}
      {query.data?.map((person) => (
        <PrimaryButton
          key={person.userId}
          label={`Unblock ${person.displayName}`}
          variant="quiet"
          busy={action.busy}
          onPress={() => {
            if (client && session)
              void action.run(() =>
                unblockUser(actorClient(client, session.access_token), person.userId),
              );
          }}
        />
      ))}
      {query.issue ? (
        <PrimaryButton label="Try again" variant="quiet" onPress={() => void query.refresh()} />
      ) : null}
      {action.issue ? <Notice error message={action.issue} /> : null}
    </Disclosure>
  );
}
