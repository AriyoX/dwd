import { useEffect } from 'react';
import { Linking, RefreshControl, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { acknowledgeNotification, getMyNotificationEvents } from '@dwd/data';
import { Action, PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { NavigationRow } from '@/components/navigation-row';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useNightAction } from '@/hooks/use-night-action';
import { useSupabase } from '@/providers/supabase-provider';
import { useNotifications } from '@/providers/notifications-provider';
import { useTheme } from '@/providers/theme-provider';
import { actorClient } from '@/lib/actor-client';
import { notificationRoute } from '@/lib/native-notifications';

export default function NotificationsScreen() {
  const push = useNotifications();
  const query = useAccountQuery(getMyNotificationEvents);
  const action = useNightAction(query.refresh);
  const { client, session } = useSupabase();
  const { colors, typography } = useTheme();
  const router = useRouter();
  const refresh = query.refresh;
  useEffect(() => {
    if (push.version) void refresh();
  }, [push.version, refresh]);
  const labels = {
    ready: 'On for this device',
    off: 'Off for this device',
    denied: 'Permission needed',
    unavailable: 'Not connected',
    connecting: 'Connecting',
  };
  return (
    <Screen
      insetTop={false}
      refreshControl={
        <RefreshControl
          refreshing={query.loading}
          onRefresh={() => void query.refresh()}
          tintColor={colors.primary}
        />
      }
    >
      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ padding: 14, borderRadius: 20, backgroundColor: colors.primarySoft }}>
            <Ionicons
              name="notifications-outline"
              size={28}
              color={colors.primary}
              accessible={false}
            />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={typography.sectionTitle}>Device notifications</Text>
            <Text style={typography.body}>{labels[push.state]}</Text>
          </View>
        </View>
        {push.state === 'ready' ? (
          <PrimaryButton
            label="Turn off on this device"
            variant="quiet"
            busy={push.busy}
            onPress={() => void push.disable()}
          />
        ) : push.state === 'denied' ? (
          <PrimaryButton
            label="Open Settings"
            variant="secondary"
            onPress={() => void Linking.openSettings().catch(() => undefined)}
          />
        ) : (
          <>
            <Notice message="Get reminders and check-ins when DWD is closed. Personal details stay in your inbox." />
            <PrimaryButton
              label={
                push.state === 'unavailable' ? 'Retry device connection' : 'Enable notifications'
              }
              icon="notifications-outline"
              busy={push.busy}
              onPress={() => void push.enable()}
            />
            {push.state === 'unavailable' ? (
              <PrimaryButton
                label="Turn off on this device"
                variant="quiet"
                disabled={push.busy}
                onPress={() => void push.disable()}
              />
            ) : null}
          </>
        )}
        {push.issue ? <Notice error message={push.issue} /> : null}
        <NavigationRow
          label="Reminder preferences"
          icon="options-outline"
          onPress={() => router.push('/reminders')}
        />
      </Panel>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        Inbox
      </Text>
      {!query.data ? (
        query.issue ? (
          <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : query.data.length === 0 ? (
        <View style={{ paddingVertical: 30, alignItems: 'center', gap: 12 }}>
          <Ionicons name="mail-open-outline" size={40} color={colors.muted} accessible={false} />
          <Text style={typography.body}>You’re all caught up</Text>
        </View>
      ) : (
        <Panel style={{ gap: 0 }}>
          {query.data.map((event, index) => (
            <View
              key={event.id}
              style={{
                paddingVertical: 16,
                gap: 10,
                borderTopWidth: index ? 0.5 : 0,
                borderTopColor: colors.border,
              }}
            >
              <Action
                label={`${event.acknowledgedAt ? '' : 'Unread. '}${event.title}. ${event.body}`}
                disabled={action.busy}
                onPress={() => {
                  if (!client || !session) return;
                  void action.run(
                    () =>
                      acknowledgeNotification(actorClient(client, session.access_token), event.id),
                    undefined,
                    () => router.push(notificationRoute(event) as Href),
                  );
                }}
                style={{ gap: 6 }}
              >
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  {!event.acknowledgedAt ? (
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: colors.primary,
                      }}
                    />
                  ) : null}
                  <Text
                    style={{
                      ...typography.body,
                      flex: 1,
                      fontWeight: event.acknowledgedAt ? '400' : '600',
                    }}
                  >
                    {event.title}
                  </Text>
                </View>
                <Text style={typography.body}>{event.body}</Text>
                <Text style={typography.body}>
                  {new Date(event.createdAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </Action>
              {!event.acknowledgedAt ? (
                <PrimaryButton
                  label="Mark read"
                  variant="quiet"
                  disabled={action.busy}
                  onPress={() => {
                    if (client && session)
                      void action.run(() =>
                        acknowledgeNotification(
                          actorClient(client, session.access_token),
                          event.id,
                        ),
                      );
                  }}
                />
              ) : null}
            </View>
          ))}
        </Panel>
      )}
      {query.issue && query.data ? (
        <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
      ) : null}
      {action.issue ? <Notice error message={action.issue} /> : null}
    </Screen>
  );
}
