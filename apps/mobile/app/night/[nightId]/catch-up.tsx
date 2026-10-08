import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { Choice } from '@/components/choice';
import { Action, PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useOffline } from '@/providers/offline-provider';
import { useTheme } from '@/providers/theme-provider';
import { catchUpRecords } from '@/lib/catch-up';
import { nightAccess } from '@/lib/night-features';

export default function CatchUpScreen() {
  const { nightId, memberId } = useLocalSearchParams<{ nightId: string; memberId?: string }>();
  const { snapshot, issue, refresh } = useNight(nightId);
  const { outbox, retry } = useOffline();
  const { typography } = useTheme();
  const router = useRouter();
  const [drinks, setDrinks] = useState(0);
  const [chasers, setChasers] = useState(0);
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [partial, setPartial] = useState(false);
  const target = snapshot?.members.find((m) => m.id === (memberId ?? snapshot.currentMemberId));
  const main = target?.planItems.find((p) => p.isQuickLog && !p.archivedAt);
  function save() {
    if (!snapshot || !target || !outbox || inFlight.current || partial) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    let saved = 0;
    try {
      const records = catchUpRecords(
        snapshot,
        target.id,
        drinks,
        chasers,
        minutes,
        outbox.store.getAll(),
        () => Crypto.randomUUID(),
      );
      for (const record of records) {
        outbox.enqueue(record);
        saved++;
      }
      void retry();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      router.back();
    } catch (error) {
      if (saved) {
        setPartial(true);
        setMessage(`${saved} entries saved. Open Entries before adding the rest.`);
      } else
        setMessage(
          error instanceof Error ? error.message : "Couldn't save these entries. Try again.",
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen insetTop={false} sheetTitle="Add missed entries">
      {!snapshot ? (
        issue ? (
          <RetryPanel issue={issue} retry={() => void refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : !target || !nightAccess(snapshot, target.id).canLog ? (
        <Notice message="Catch-up logging is unavailable for this person." />
      ) : (
        <>
          <Text style={typography.sectionTitle}>{target.displayName}</Text>
          <Notice message="Times are approximate. Review entries outside your plan in Entries." />
          <Panel>
            <Counter
              label="Drinks"
              value={drinks}
              onChange={setDrinks}
              disabled={busy || partial}
            />
            <Counter
              label="Chasers"
              value={chasers}
              onChange={setChasers}
              disabled={busy || partial}
            />
          </Panel>
          {main ? (
            <Notice
              message={`Uses ${main.label}, ${main.volumeMl} ml at ${main.abvPercent}%.${main.sharedBottleId ? ' Missed drinks won’t use up the shared bottle.' : ''}`}
            />
          ) : (
            <Notice message="Set a main drink in your plan to add missed drinks." />
          )}
          <Text style={typography.sectionTitle}>About when?</Text>
          {[0, 15, 30, 60].map((value) => (
            <Choice
              key={value}
              label={
                value === 0
                  ? 'Just now'
                  : value === 60
                    ? 'About an hour ago'
                    : `About ${value} minutes ago`
              }
              selected={minutes === value}
              disabled={busy || partial}
              onPress={() => setMinutes(value)}
            />
          ))}
          {message ? <Notice error message={message} /> : null}
          {partial ? (
            <PrimaryButton label="View entries" onPress={() => router.replace('/history')} />
          ) : (
            <PrimaryButton
              label="Add missed entries"
              busy={busy}
              disabled={drinks + chasers === 0 || (drinks > 0 && !main)}
              onPress={save}
            />
          )}
        </>
      )}
    </Screen>
  );
}
function Counter({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <Text style={typography.sectionTitle}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        {([-1, 1] as const).map((delta, index) => (
          <View key={delta} style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            {index === 1 ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{
                  fontSize: 32,
                  fontWeight: '600',
                  color: colors.text,
                  minWidth: 40,
                  textAlign: 'center',
                }}
              >
                {value}
              </Text>
            ) : null}
            <Action
              label={`${delta < 0 ? 'Remove' : 'Add'} one ${label.toLowerCase()}`}
              disabled={disabled || (delta < 0 ? value === 0 : value === 10)}
              onPress={() => onChange(value + delta)}
              style={{
                minHeight: 48,
                minWidth: 48,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceSoft,
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 24 }}>{delta < 0 ? '−' : '+'}</Text>
            </Action>
          </View>
        ))}
      </View>
    </View>
  );
}
