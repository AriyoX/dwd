import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Text, View, type ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Choice } from '@/components/choice';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen, ScreenHeading } from '@/components/screen';
import { NightArtwork } from '@/components/night-artwork';
import { NightMetrics } from '@/components/night-metrics';
import { SettingsRow } from '@/components/settings-row';
import { useTheme } from '@/providers/theme-provider';
import { useSupabase } from '@/providers/supabase-provider';
import {
  initialPracticeState,
  practiceReducer,
  practiceTotals,
  readTourProgress,
  saveTourProgress,
  rememberTourSeen,
  TOUR_STEPS,
} from '@/lib/practice-tour';

export default function TourScreen() {
  const { session } = useSupabase();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  return session ? (
    <Practice
      key={`${session.user.id}:${replay ?? ''}`}
      owner={session.user.id}
      replay={replay === '1'}
    />
  ) : null;
}
function Practice({ owner, replay }: { owner: string; replay: boolean }) {
  const { colors, typography } = useTheme();
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  const [step, setStep] = useState(() => {
    const progress = readTourProgress(globalThis.localStorage, owner);
    return !replay && progress?.status === 'active' ? progress.step : 0;
  });
  const [state, dispatch] = useReducer(practiceReducer, initialPracticeState);
  const [glass, setGlass] = useState<30 | 45>(30);
  const [issue, setIssue] = useState<string | null>(null);
  const totals = practiceTotals(state);
  useEffect(() => {
    try {
      rememberTourSeen(globalThis.localStorage, owner);
    } catch {
      /* The tour still works. */
    }
  }, [owner]);
  useLayoutEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step]);
  function remember(next: number, status: 'active' | 'skipped' | 'complete') {
    try {
      saveTourProgress(globalThis.localStorage, owner, { step: next, status });
      setIssue(null);
    } catch {
      setIssue('Tour progress could not be saved on this device. You can still continue.');
    }
    if (status === 'active') {
      setStep(next);
      dispatch({ type: 'cancel' });
    } else if (router.canGoBack()) router.back();
    else router.replace('/');
  }
  return (
    <Screen insetTop={false} scrollRef={scroll}>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}
      >
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
          Practice · {step + 1} of {TOUR_STEPS.length}
        </Text>
        <Text style={typography.body}>Nothing here logs a real drink</Text>
      </View>
      <ScreenHeading title={TOUR_STEPS[step] ?? 'Practice tour'} />
      {step === 0 ? (
        <Panel>
          <NightArtwork compact />
          <Text style={typography.sectionTitle}>Friday with friends</Text>
          <Notice message="A plan records what you chose. It is not a target to reach." />
          <Choice
            label="2 beers"
            detail="330 ml · 5% ABV each"
            selected={state.plan === 'beer'}
            onPress={() => dispatch({ type: 'plan', plan: 'beer' })}
          />
          <Choice
            label="Chaser only"
            selected={state.plan === 'chaser'}
            onPress={() => dispatch({ type: 'plan', plan: 'chaser' })}
          />
          <Text style={typography.body}>Planned finish · 11:00 pm</Text>
        </Panel>
      ) : step === 1 ? (
        <Panel>
          <Ionicons name="link-outline" size={32} color={colors.primary} accessible={false} />
          <Notice message="Share an invitation from your night. Friends join and log for themselves; hosts can record for guests who agree." />
          <PrimaryButton
            label="Try a practice invitation"
            icon="person-add-outline"
            disabled={state.invited}
            onPress={() => dispatch({ type: 'invite' })}
          />
          {state.invited ? (
            <Notice message="Alex joined your practice night. No invitation was sent." />
          ) : null}
        </Panel>
      ) : step === 2 ? (
        <Panel>
          <NightMetrics drinks={totals.drinks} water={totals.chasers} />
          <PrimaryButton
            label="Log a practice beer"
            icon="wine-outline"
            disabled={Boolean(state.warning)}
            onPress={() => dispatch({ type: 'log', kind: 'drink' })}
          />
          <PrimaryButton
            label="Add a practice chaser"
            variant="water"
            disabled={Boolean(state.warning)}
            onPress={() => dispatch({ type: 'log', kind: 'chaser' })}
          />
          <PrimaryButton
            label="Undo last entry"
            variant="quiet"
            disabled={!state.entries.length}
            onPress={() => dispatch({ type: 'undo' })}
          />
        </Panel>
      ) : step === 3 ? (
        <Panel>
          <Text style={typography.sectionTitle}>A shared bottle</Text>
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: colors.text,
              fontSize: 32,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
            }}
          >
            {totals.remainingMl} ml left
          </Text>
          <Notice message="Each glass comes from the same bottle. Connect to the internet to log shared drinks." />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([30, 45] as const).map((amount) => (
              <View key={amount} style={{ flex: 1 }}>
                <Choice
                  compact
                  label={`${amount} ml`}
                  selected={glass === amount}
                  disabled={Boolean(state.warning)}
                  onPress={() => setGlass(amount)}
                />
              </View>
            ))}
          </View>
          <PrimaryButton
            label="Log a practice glass"
            disabled={Boolean(state.warning) || totals.remainingMl < glass}
            onPress={() => dispatch({ type: 'log', kind: 'drink', bottleMl: glass })}
          />
          <PrimaryButton
            label="Undo last entry"
            variant="quiet"
            disabled={!state.entries.length}
            onPress={() => dispatch({ type: 'undo' })}
          />
        </Panel>
      ) : step === 4 ? (
        <Panel>
          <Text style={typography.sectionTitle}>Alex</Text>
          <Text style={typography.body}>1 drink · 1 chaser</Text>
          <PrimaryButton
            label="Send a practice check-in"
            icon="chatbubble-outline"
            disabled={state.checkedIn}
            onPress={() => dispatch({ type: 'check-in' })}
          />
          {state.checkedIn ? (
            <Notice message="Practice check-in sent. In a real night, Alex can reply in DWD." />
          ) : null}
          <Notice message="A check-in does not contact emergency services." />
        </Panel>
      ) : step === 5 ? (
        <Panel>
          <PrimaryButton
            label="Explore Get help"
            icon="medical-outline"
            variant="secondary"
            onPress={() => dispatch({ type: 'help' })}
          />
          {state.helpOpen ? (
            <>
              <Text style={typography.sectionTitle}>Emergency help</Text>
              <Notice message="Your real night's Get help screen has emergency numbers and guidance. Phone calls are disabled in this tour." />
              <PrimaryButton
                label="Emergency call · practice only"
                variant="danger"
                disabled
                onPress={() => undefined}
              />
            </>
          ) : null}
        </Panel>
      ) : step === 6 ? (
        <Panel>
          <Text style={typography.sectionTitle}>Friday recap</Text>
          <NightMetrics drinks={totals.drinks} water={totals.chasers} />
          <Text style={typography.body}>Started · 9:00 pm</Text>
          <Text style={typography.body}>Planned finish · 11:00 pm</Text>
          <Text style={typography.body}>Wrapped up · 10:45 pm</Text>
          <Notice message="Finished nights appear in Entries. Open a recap for drink details, times and photos." />
        </Panel>
      ) : step === 7 ? (
        <Panel>
          {state.memory ? (
            <>
              <NightArtwork compact />
              <Text style={typography.body}>Sample memory · only in this tour</Text>
            </>
          ) : (
            <Ionicons name="images-outline" size={48} color={colors.muted} accessible={false} />
          )}
          <PrimaryButton
            label={state.memory ? 'Remove sample memory' : 'Add sample memory'}
            variant="secondary"
            onPress={() => dispatch({ type: 'memory' })}
          />
          <Notice message="After a real night ends, choose Photo memories in its recap. Each person can add 2 photos, visible to everyone from that night." />
        </Panel>
      ) : (
        <Panel>
          <SettingsRow
            label="Practice reminders"
            value={state.reminders}
            onChange={() => dispatch({ type: 'reminders' })}
          />
          <Notice message="Turn on reminders in Settings → Notifications." />
        </Panel>
      )}
      {state.warning ? (
        <Panel>
          <Notice message="This entry is outside your practice plan. Real entries also ask you to review this warning." />
          <PrimaryButton
            label="Confirm practice entry"
            onPress={() => dispatch({ type: 'confirm' })}
          />
          <PrimaryButton
            label="Cancel entry"
            variant="quiet"
            onPress={() => dispatch({ type: 'cancel' })}
          />
        </Panel>
      ) : null}
      {state.entries.length >= 20 ? (
        <Notice message="Practice is full. Undo an entry to try again." />
      ) : null}
      {issue ? <Notice error message={issue} /> : null}
      <PrimaryButton
        label={step === TOUR_STEPS.length - 1 ? 'Finish tour' : 'Next'}
        onPress={() =>
          remember(
            Math.min(step + 1, TOUR_STEPS.length - 1),
            step === TOUR_STEPS.length - 1 ? 'complete' : 'active',
          )
        }
      />
      {step > 0 ? (
        <PrimaryButton
          label="Previous step"
          variant="quiet"
          onPress={() => remember(step - 1, 'active')}
        />
      ) : null}
      <PrimaryButton label="Skip tour" variant="quiet" onPress={() => remember(step, 'skipped')} />
    </Screen>
  );
}
