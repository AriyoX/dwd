import { Text } from 'react-native';
import { getBlockedUsers, unblockUser } from '@dwd/data';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useNightAction } from '@/hooks/use-night-action';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { actorClient } from '@/lib/actor-client';
import { Notice, Panel } from './screen';
import { PrimaryButton } from './primary-button';
export function BlockedUsers() {
  const query = useAccountQuery(getBlockedUsers);
  const action = useNightAction(query.refresh);
  const { client, session } = useSupabase();
  const { typography } = useTheme();
  return (
    <Panel>
      <Text style={typography.sectionTitle}>Blocked people</Text>
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
        <PrimaryButton
          label="Retry blocked people"
          variant="quiet"
          onPress={() => void query.refresh()}
        />
      ) : null}
      {action.issue ? <Notice error message={action.issue} /> : null}
    </Panel>
  );
}
