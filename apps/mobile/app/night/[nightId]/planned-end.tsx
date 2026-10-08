import { useState } from 'react';
import { invalidateAccountQuery } from '@/lib/account-query-state';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { canUserEndOrExtendNight, canUserLeaveNight, formatNightDateTime } from '@dwd/core';
import { endNight, extendNight, leaveNight } from '@dwd/data';
import { Choice } from '@/components/choice';
import { PrimaryButton } from '@/components/primary-button';
import {
  LoadingPanel,
  Notice,
  Panel,
  RetryPanel,
  Screen,
  ScreenHeading,
} from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useNightAction } from '@/hooks/use-night-action';
import { confirmAction } from '@/lib/confirm';
import { actorClient } from '@/lib/actor-client';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function PlannedEndScreen() {
  const { nightId } = useLocalSearchParams<{ nightId: string }>();
  const query = useNight(nightId);
  const action = useNightAction(query.refresh);
  const { client, session } = useSupabase();
  const router = useRouter();
  const { typography } = useTheme();
  const [minutes, setMinutes] = useState(30);
  const snapshot = query.snapshot;
  const actor = snapshot?.members.find((m) => m.id === snapshot.currentMemberId);
  const host = snapshot && canUserEndOrExtendNight(snapshot.currentUserId, snapshot.night);
  const connection = client && session ? actorClient(client, session.access_token) : null;
  return (
    <Screen insetTop={false} sheetTitle="Night check-in">
      {!snapshot ? (
        query.issue ? (
          <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : snapshot.night.status === 'ended' ? (
        <PrimaryButton
          label="View recap"
          onPress={() => router.replace(`/night/${nightId}/summary`)}
        />
      ) : (
        <>
          <ScreenHeading title="Night check-in" />
          <Text style={typography.body}>
            Planned end · {formatNightDateTime(snapshot.night.endsAt, snapshot.night.timezone)}
          </Text>
          {host ? (
            <>
              <Panel>
                <Text style={typography.sectionTitle}>Need more time?</Text>
                {[15, 30, 60, 120].map((value) => (
                  <Choice
                    key={value}
                    label={value === 60 ? '1 hour' : value === 120 ? '2 hours' : `${value} minutes`}
                    selected={minutes === value}
                    disabled={action.busy}
                    onPress={() => setMinutes(value)}
                  />
                ))}
                <PrimaryButton
                  label="Extend night"
                  icon="time-outline"
                  busy={action.busy}
                  onPress={() => {
                    if (connection)
                      void action.run(
                        () => extendNight(connection, nightId, minutes),
                        undefined,
                        () => router.back(),
                      );
                  }}
                />
              </Panel>
              <PrimaryButton
                label="End night for everyone"
                variant="danger"
                disabled={action.busy}
                onPress={() =>
                  void (async () => {
                    if (
                      connection &&
                      (await confirmAction(
                        'End this night?',
                        'Everyone will move to the night recap.',
                        'End night',
                        true,
                      ))
                    )
                      void action.run(
                        async () => {
                          await endNight(connection, nightId);
                          invalidateAccountQuery(snapshot.currentUserId, 'finished-nights');
                        },
                        undefined,
                        () => router.replace(`/night/${nightId}/summary`),
                      );
                  })()
                }
              />
            </>
          ) : (
            <>
              <Notice message="The host can extend or end this night. Entries after the planned end still need your acknowledgment." />
              {actor && canUserLeaveNight(snapshot.currentUserId, snapshot.night, actor) ? (
                <PrimaryButton
                  label="Leave night"
                  variant="secondary"
                  busy={action.busy}
                  onPress={() =>
                    void (async () => {
                      if (
                        connection &&
                        (await confirmAction(
                          'Leave this night?',
                          'You can rejoin with an active invite.',
                          'Leave night',
                        ))
                      )
                        void action.run(
                          () => leaveNight(connection, nightId),
                          undefined,
                          () => router.replace('/'),
                        );
                    })()
                  }
                />
              ) : null}
            </>
          )}
          <PrimaryButton
            label="Keep logging"
            variant="quiet"
            disabled={action.busy}
            onPress={() => router.back()}
          />
        </>
      )}
      {action.issue ? <Notice error message={action.issue} /> : null}
    </Screen>
  );
}
