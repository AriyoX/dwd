import { useCallback, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dwd/core';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { displayNameSchema } from '@dwd/core';
import { getAccountDetails, updateDisplayName } from '@dwd/data';
import { TextField } from '@/components/text-field';
import { PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useNightAction } from '@/hooks/use-night-action';
import { actorClient } from '@/lib/actor-client';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { CampaignCountrySettings } from '@/components/campaign-country-settings';

export default function ProfileScreen() {
  const { session } = useSupabase();
  const owner = session?.user.id ?? '';
  const load = useCallback(
    (connection: SupabaseClient<Database>) => getAccountDetails(connection, owner),
    [owner],
  );
  const query = useAccountQuery(load);
  return (
    <Screen insetTop={false} sheetTitle="Edit profile">
      <CampaignCountrySettings key={session?.user.id} />
      {query.data ? (
        <ProfileForm
          key={session?.user.id}
          name={query.data.display_name}
          refresh={query.refresh}
        />
      ) : query.issue ? (
        <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
      ) : (
        <LoadingPanel />
      )}
    </Screen>
  );
}
function ProfileForm({ name, refresh }: { name: string; refresh: () => Promise<void> }) {
  const { client, session } = useSupabase();
  const router = useRouter();
  const { typography } = useTheme();
  const action = useNightAction(refresh);
  const [value, setValue] = useState(name);
  const [issue, setIssue] = useState<string | null>(null);
  return (
    <Panel>
      <TextField
        label="Display name"
        value={value}
        maxLength={60}
        editable={!action.busy}
        onChangeText={(text) => {
          setValue(text);
          setIssue(null);
        }}
      />
      <Text style={typography.body}>{session?.user.email}</Text>
      <Notice message="Your name is visible to people in your nights. Completed recaps keep the name recorded at the time." />
      {issue || action.issue ? <Notice error message={issue ?? action.issue ?? ''} /> : null}
      <PrimaryButton
        label="Save profile"
        busy={action.busy}
        onPress={() => {
          const parsed = displayNameSchema.safeParse(value);
          if (!parsed.success) {
            setIssue('Use 1 to 60 characters for your display name.');
            return;
          }
          if (client && session)
            void action.run(
              () => updateDisplayName(actorClient(client, session.access_token), parsed.data),
              undefined,
              () => router.back(),
            );
        }}
      />
    </Panel>
  );
}
