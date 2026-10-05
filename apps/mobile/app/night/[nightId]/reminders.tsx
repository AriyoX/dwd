import { Stack } from 'expo-router';
import { Text } from 'react-native';
import type { NotificationPreferences } from '@dwd/core';
import {
  getNotificationPreferences,
  setReminderPause,
  updateNotificationPreferences,
} from '@dwd/data';
import { Choice } from '@/components/choice';
import { PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { SettingsRow } from '@/components/settings-row';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useNightAction } from '@/hooks/use-night-action';
import { useNow } from '@/hooks/use-night';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { useRouter } from 'expo-router';

export default function RemindersScreen() {
  const { session } = useSupabase();
  const router = useRouter();
  const query = useAccountQuery(getNotificationPreferences);
  return (
    <Screen insetTop={false} sheetTitle="Reminders">
      <Stack.Screen options={{ title: 'Reminders' }} />
      {!query.data ? (
        query.issue ? (
          <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : (
        <ReminderControls key={session?.user.id} initial={query.data} refresh={query.refresh} />
      )}
      <PrimaryButton
        label="Device notifications & inbox"
        icon="notifications-outline"
        variant="quiet"
        onPress={() => router.push('/notifications')}
      />
    </Screen>
  );
}

function ReminderControls({
  initial,
  refresh,
}: {
  initial: NotificationPreferences;
  refresh: () => Promise<void>;
}) {
  const { client } = useSupabase();
  const { typography } = useTheme();
  const now = useNow();
  const preferences = initial;
  const action = useNightAction(refresh);
  const paused = Boolean(
    preferences.remindersMutedUntil && Date.parse(preferences.remindersMutedUntil) > now,
  );
  function save(patch: Partial<NotificationPreferences>) {
    if (client)
      void action.run(
        () => updateNotificationPreferences(client, { ...preferences, ...patch }),
        'Reminder settings saved.',
      );
  }
  return (
    <>
      <Panel>
        <Text accessibilityRole="header" style={typography.sectionTitle}>
          Log reminders
        </Text>
        <Notice message="A nudge when you haven’t logged for a while. Settings apply to your account across devices." />
        <SettingsRow
          label="Remind me to log"
          value={preferences.periodicWaterEnabled}
          disabled={action.busy}
          onChange={(periodicWaterEnabled) => save({ periodicWaterEnabled })}
        />
        {preferences.periodicWaterEnabled
          ? ([15, 30, 45, 60] as const).map((minutes) => (
              <Choice
                key={minutes}
                label={minutes === 60 ? 'Every hour' : `Every ${minutes} minutes`}
                selected={preferences.periodicIntervalMinutes === minutes}
                disabled={action.busy}
                onPress={() => save({ periodicIntervalMinutes: minutes })}
              />
            ))
          : null}
        {paused && preferences.remindersMutedUntil ? (
          <Notice
            message={`Paused until ${new Date(preferences.remindersMutedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          />
        ) : null}
        {preferences.periodicWaterEnabled || paused ? (
          <PrimaryButton
            label={paused ? 'Resume log reminders' : 'Pause for 1 hour'}
            icon={paused ? 'play-outline' : 'pause-outline'}
            variant="secondary"
            busy={action.busy}
            onPress={() => {
              if (client)
                void action.run(
                  () => setReminderPause(client, paused ? null : 60),
                  paused ? 'Log reminders resumed.' : 'Log reminders paused for 1 hour.',
                );
            }}
          />
        ) : null}
      </Panel>
      <Panel>
        <Text accessibilityRole="header" style={typography.sectionTitle}>
          Other reminders
        </Text>
        <SettingsRow
          label="Group attention"
          value={preferences.groupAttentionEnabled}
          disabled={action.busy}
          onChange={(groupAttentionEnabled) => save({ groupAttentionEnabled })}
        />
        <SettingsRow
          label="Direct check-ins"
          value={preferences.directCheckinsEnabled}
          disabled={action.busy}
          onChange={(directCheckinsEnabled) => save({ directCheckinsEnabled })}
        />
        <SettingsRow
          label="Personal pace"
          value={preferences.personalPaceEnabled}
          disabled={action.busy}
          onChange={(personalPaceEnabled) => save({ personalPaceEnabled })}
        />
        <SettingsRow
          label="Planned end"
          value={preferences.plannedEndEnabled}
          disabled={action.busy}
          onChange={(plannedEndEnabled) => save({ plannedEndEnabled })}
        />
      </Panel>
      {action.issue ? <Notice error message={action.issue} /> : null}
      {action.notice ? <Notice message={action.notice} /> : null}
    </>
  );
}
