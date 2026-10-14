import { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  QUICK_LOG_RETENTION,
  availableQuickEntries,
  isQuickSessionStale,
  quickCountLabel,
  quickKindLabel,
  quickCorrectionKind,
  quickEntryLocked,
  quickRelativeTime,
  unresolvedQuickTransfers,
  type QuickKind,
} from '@dwd/core';
import type { QuickUndo } from '@dwd/contracts';
import { useQuickLog } from '@/hooks/use-quick-log';
import { Action, PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen } from '@/components/screen';
import { Choice } from '@/components/choice';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function QuickLogScreen() {
  const params = useLocalSearchParams<{ scope?: string; sessionId?: string }>();
  const { scope } = useQuickLog(params.scope === 'guest');
  return (
    <Logger
      key={`${scope}:${params.sessionId ?? ''}`}
      guest={params.scope === 'guest'}
      selectedId={params.sessionId}
    />
  );
}
function Logger({ guest, selectedId }: { guest: boolean; selectedId: string | undefined }) {
  const { store, state, scope } = useQuickLog(guest);
  const { session: account } = useSupabase();
  const { colors, typography } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { width, fontScale } = useWindowDimensions();
  const circleSize = Math.min(width - 44, Math.max(232, 168 * fontScale));
  const [selected, setSelected] = useState(selectedId);

  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [undo, setUndo] = useState<QuickUndo | null>(state.record.undo);
  const [issue, setIssue] = useState<string | null>(null);
  const [continued, setContinued] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const current = store.session(selected);
  const stale = !continued && isQuickSessionStale(current, now);
  const readOnly = current?.state === 'finished';
  const writable = state.hydrated && !state.blocked && !readOnly && !stale;
  const pending = unresolvedQuickTransfers(state.record).find((o) => o.sessionId === current?.id);
  function run(action: () => void) {
    try {
      action();
      setIssue(null);
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Couldn’t update this entry.');
    }
  }
  function announce(text: string) {
    AccessibilityInfo.announceForAccessibility(text);
  }
  function log(kind: QuickKind) {
    run(() => {
      const action = store.log(kind);
      // Keep the device session selected if auth restoration completes after this tap.
      if (scope === 'guest' && !guest) router.setParams({ scope: 'guest' });
      setUndo(action);
      setSelected(undefined);
      announce(`${quickKindLabel(kind)} logged`);
      setNow(Date.now());
      if (!reduced)
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    });
  }
  const entries = [...(current?.entries ?? [])]
    .filter((e) => !e.removedAt)
    .sort((a, b) => b.sequence - a.sequence);
  const canUndo =
    undo &&
    current?.state === 'active' &&
    current.entries.some(
      (e) =>
        e.id === undo.entryId && e.revision === undo.revision && !quickEntryLocked(state.record, e),
    );
  return (
    <Screen hidePermissionReminder contentStyle={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Action
          label="Back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace(account ? '/' : '/welcome')
          }
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </Action>
        <Text accessibilityRole="header" style={{ ...typography.sectionTitle, flex: 1 }}>
          Quick Log
        </Text>
        <Action
          label="Session options"
          expanded={menu}
          onPress={() => setMenu((v) => !v)}
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.primary} />
        </Action>
      </View>
      {menu ? (
        <Panel>
          <Text style={typography.body}>
            {scope === 'guest' ? 'Guest session' : 'Your account’s session'}
          </Text>
          <PrimaryButton
            label="Past quick sessions"
            variant="quiet"
            onPress={() =>
              router.push({
                pathname: '/quick-history',
                params: { scope: scope === 'guest' ? 'guest' : 'account' },
              })
            }
          />
          {account ? (
            <PrimaryButton
              label={scope === 'guest' ? 'Your account’s quick logs' : 'Guest logs on this device'}
              variant="quiet"
              onPress={() =>
                router.replace({
                  pathname: '/quick-log',
                  params: { scope: scope === 'guest' ? 'account' : 'guest' },
                })
              }
            />
          ) : null}
          <PrimaryButton
            label="Finish and start new"
            variant="quiet"
            disabled={!current || readOnly}
            onPress={() =>
              run(() => {
                store.startNew();
                router.setParams({ sessionId: undefined });
                setSelected(undefined);
                setUndo(null);
                setContinued(true);
                setMenu(false);
              })
            }
          />
          <Text style={typography.body}>{QUICK_LOG_RETENTION}</Text>
          {current ? (
            <Text style={typography.body}>
              Started {new Date(current.createdAt).toLocaleString()}
            </Text>
          ) : null}
          {state.recoveryRaw ? (
            <PrimaryButton
              label="Copy saved data for recovery"
              variant="secondary"
              onPress={() => void Clipboard.setStringAsync(state.recoveryRaw ?? '')}
            />
          ) : null}
        </Panel>
      ) : null}
      <Text
        accessibilityRole="header"
        style={{
          ...typography.heading,
          fontSize: 28,
          lineHeight: 36,
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
        }}
      >
        {quickCountLabel(entries)}
      </Text>
      {entries.length ? (
        <Text style={{ ...typography.body, textAlign: 'center' }}>
          {readOnly ? 'Session finished' : quickRelativeTime(current, now)}
        </Text>
      ) : null}
      {stale && current ? (
        <Panel>
          <Text style={typography.body}>
            Session from{' '}
            {new Date(current.createdAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          <PrimaryButton label="Continue this session" onPress={() => setContinued(true)} />
          <PrimaryButton
            label="Start new"
            variant="secondary"
            onPress={() =>
              run(() => {
                store.startNew();
                router.setParams({ sessionId: undefined });
                setSelected(undefined);
                setUndo(null);
                setContinued(true);
              })
            }
          />
        </Panel>
      ) : null}
      {!state.record.eligible && !readOnly ? (
        <Choice
          label="I am 18 or older and meet the local legal drinking age."
          selected={false}
          onPress={() => run(() => store.acknowledgeEligibility())}
        />
      ) : null}
      <View style={{ alignItems: 'center', gap: 18, paddingVertical: 8 }}>
        <Action
          label="Log one drink"
          disabled={!writable || !state.record.eligible}
          onPress={() => log('drink')}
          containerStyle={{ width: circleSize, maxWidth: '100%' }}
          style={{
            width: '100%',
            aspectRatio: 1,
            padding: 24,
            gap: 12,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 999,
            backgroundColor: colors.primaryFill,
            borderWidth: 6,
            borderColor: colors.primarySoft,
          }}
        >
          <Ionicons name="add" size={52} color={colors.onPrimary} accessible={false} />
          <Text
            style={{
              color: colors.onPrimary,
              fontSize: 22,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            Log drink
          </Text>
        </Action>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <PrimaryButton
            label="Chaser"
            icon="cafe-outline"
            variant="secondary"
            disabled={!writable || !state.record.eligible}
            onPress={() => log('chaser')}
          />
          <Action
            label="Undo last action"
            disabled={!canUndo}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingHorizontal: 16,
            }}
            onPress={() =>
              run(() => {
                if (undo) store.undo(undo);
                setUndo(null);
                announce('Action undone');
              })
            }
          >
            <Ionicons
              name="arrow-undo-outline"
              size={18}
              color={colors.primary}
              accessible={false}
            />
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Undo</Text>
          </Action>
        </View>
        <Text style={{ ...typography.body, color: colors.muted, fontSize: 13 }}>
          Chasers are non-alcoholic.
        </Text>
      </View>
      <Panel>
        <Action
          label="Recent activity"
          expanded={expanded}
          onPress={() => setExpanded((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Text style={{ ...typography.sectionTitle, flex: 1 }}>Recent activity</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            color={colors.primary}
            size={22}
          />
        </Action>
        {expanded
          ? entries.map((e) => (
              <View key={e.id} style={{ gap: 6, paddingVertical: 8 }}>
                <Text style={{ ...typography.body, color: colors.text }}>
                  {quickKindLabel(e.kind)} ·{' '}
                  {new Date(e.recordedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
                {e.destination ? (
                  <PrimaryButton
                    label="Added to a night · Open night"
                    variant="quiet"
                    onPress={() => {
                      if (e.destination) router.push(`/night/${e.destination.nightId}`);
                    }}
                  />
                ) : quickEntryLocked(state.record, e) ? (
                  <Text style={typography.body}>Checking whether this entry was added</Text>
                ) : !readOnly ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <PrimaryButton
                      label={`Change to ${quickKindLabel(quickCorrectionKind(e.kind))}`}
                      variant="quiet"
                      onPress={() =>
                        run(() => {
                          setUndo(store.correct(e.sessionId, e.id, quickCorrectionKind(e.kind)));
                          announce('Entry corrected');
                        })
                      }
                    />
                    <PrimaryButton
                      label="Remove"
                      variant="quiet"
                      onPress={() =>
                        run(() => {
                          setUndo(store.correct(e.sessionId, e.id, 'remove'));
                          announce('Entry removed');
                        })
                      }
                    />
                  </View>
                ) : null}
              </View>
            ))
          : null}
      </Panel>
      {issue || state.issue ? (
        <View style={{ gap: 8 }}>
          <Notice error message={issue ?? state.issue ?? ''} />
          {state.issue ? (
            <PrimaryButton
              label="Retry saving"
              variant="secondary"
              onPress={() => store.retrySave()}
            />
          ) : null}
        </View>
      ) : null}
      <PrimaryButton
        label={pending ? 'Check adding logs to a night' : 'Add to a night'}
        variant="secondary"
        disabled={!current || !availableQuickEntries(current).length || state.blocked}
        onPress={() =>
          run(() => {
            if (!current) return;
            if (!pending)
              store.setIntent({
                sessionId: current.id,
                accountId: account?.user.id ?? null,
                nightId: null,
                destination: 'choose',
              });
            if (!store.getSnapshot().saved) throw new Error('Couldn’t save on this device');
            router.push({
              pathname: '/quick-transfer',
              params: { scope: scope === 'guest' ? 'guest' : 'account', sessionId: current.id },
            });
          })
        }
      />
      {!readOnly ? (
        <PrimaryButton
          label="Finish session"
          variant="quiet"
          disabled={!current}
          onPress={() =>
            run(() => {
              if (current) {
                store.finish(current.id);
                setSelected(current.id);
                setUndo(null);
                announce('Session finished');
              }
            })
          }
        />
      ) : (
        <>
          <PrimaryButton
            label="Start another session"
            variant="quiet"
            onPress={() =>
              run(() => {
                store.startNew();
                router.setParams({ sessionId: undefined });
                setSelected(undefined);
                setContinued(true);
              })
            }
          />
          {!current.entries.some((e) => e.destination) && !pending ? (
            <PrimaryButton
              label="Reopen session"
              variant="quiet"
              onPress={() =>
                run(() => {
                  store.reopen(current.id);
                })
              }
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
