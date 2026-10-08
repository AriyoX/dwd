import { getBlockedUsers, unblockUser } from '@dwd/data';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useNightAction } from '@/hooks/use-night-action';
import { useSupabase } from '@/providers/supabase-provider';
import { actorClient } from '@/lib/actor-client';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/theme-provider';
import { Notice, LoadingPanel, Panel, RetryPanel } from './screen';
import { PrimaryButton } from './primary-button';
export function BlockedUsers() {
  const query = useAccountQuery(getBlockedUsers);
  const action = useNightAction(query.refresh);
  const { client, session } = useSupabase();
  const { colors, typography } = useTheme();
  return (
    <View style={{ gap: 16 }}>
      {!query.data && !query.issue ? <LoadingPanel /> : null}
      {query.data?.length === 0 ? (
        <Panel style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Ionicons
            name="person-remove-outline"
            size={32}
            color={colors.muted}
            accessible={false}
          />
          <Text style={typography.sectionTitle}>No blocked people</Text>
        </Panel>
      ) : null}
      {query.data?.map((person) => (
        <Panel key={person.userId}>
          <Text style={typography.sectionTitle}>{person.displayName}</Text>
          <PrimaryButton
            label={`Unblock ${person.displayName}`}
            icon="person-add-outline"
            variant="secondary"
            busy={action.busy}
            busyLabel="Unblocking"
            onPress={() => {
              if (client && session)
                void action.run(() =>
                  unblockUser(actorClient(client, session.access_token), person.userId),
                );
            }}
          />
        </Panel>
      ))}
      {query.issue ? <RetryPanel issue={query.issue} retry={() => void query.refresh()} /> : null}
      {action.issue ? <Notice error message={action.issue} /> : null}
    </View>
  );
}
