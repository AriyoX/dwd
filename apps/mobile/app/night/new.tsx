import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNow } from '@/hooks/use-night';
import { Text, View, type ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import {
  formatNightDateTime,
  resolveWallTimeInTimeZone,
  safeTimeZone,
  wallClockFromInstant,
  type StartNightInput,
} from '@dwd/core';
import { DataAccessError, startNightOut } from '@dwd/data';
import { Choice } from '@/components/choice';
import { DateTimeField } from '@/components/date-time-field';
import { PlanEditor } from '@/components/plan-editor';
import { Action, PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen, ScreenHeading } from '@/components/screen';
import { SettingsRow } from '@/components/settings-row';
import { TextField } from '@/components/text-field';
import { actorClient } from '@/lib/actor-client';
import { withRequestTimeout } from '@/lib/request-timeout';
import {
  materializeNightDraft,
  newNightDraft,
  nightDraftKey,
  readNightDraft,
  type NightDraft,
} from '@/lib/night-draft';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function NewNightScreen() {
  const { session } = useSupabase();
  return session ? <Setup key={session.user.id} owner={session.user.id} /> : null;
}
function Setup({ owner }: { owner: string }) {
  const { client, session } = useSupabase();
  const currentOwner = useRef(owner);
  useLayoutEffect(() => {
    currentOwner.current = session?.user.id ?? '';
  }, [session]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { colors, typography } = useTheme();
  const [draft, setDraft] = useState<NightDraft>(() => newNightDraft(owner, Crypto.randomUUID()));
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [storageIssue, setStorageIssue] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const inFlight = useRef(false);
  const attempt = useRef<StartNightInput | null>(null);
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [draft.step]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = readNightDraft(globalThis.localStorage, owner);
        if (saved) {
          setDraft(saved);
          setRestored(true);
          if (saved.attempt) attempt.current = saved.attempt;
        }
      } catch {
        setUnreadable(true);
        setStorageIssue('Could not restore setup. Your saved draft has been kept.');
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [owner]);
  useEffect(() => {
    if (!ready || storageIssue) return;
    try {
      globalThis.localStorage.setItem(nightDraftKey(owner), JSON.stringify(draft));
    } catch {
      queueMicrotask(() =>
        setStorageIssue('Could not save setup on this device. Keep this screen open.'),
      );
    }
  }, [draft, ready, owner, storageIssue]);
  function edit(patch: Partial<NightDraft>) {
    if (busy || attempt.current) return;
    setDraft((value) => ({ ...value, ...patch }));
    setIssue(null);
  }
  function discard() {
    if (attempt.current) return;
    try {
      globalThis.localStorage.removeItem(nightDraftKey(owner));
      setDraft(newNightDraft(owner, Crypto.randomUUID()));
      setRestored(false);
      setStorageIssue(null);
      setUnreadable(false);
      setIssue(null);
    } catch {
      setStorageIssue('Could not discard the draft. Retry when device storage is available.');
    }
  }
  function review() {
    try {
      materializeNightDraft(draft);
      edit({ step: 3 });
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'Check the night details.');
    }
  }
  async function start() {
    if (!client || !session || inFlight.current || storageIssue) return;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    try {
      const command = attempt.current ?? materializeNightDraft(draft);
      attempt.current = command;
      const next = { ...draft, attempt: command };
      setDraft(next);
      globalThis.localStorage.setItem(nightDraftKey(owner), JSON.stringify(next));
      const result = await withRequestTimeout((signal) =>
        startNightOut(actorClient(client, session.access_token, signal), command, true),
      );
      if (currentOwner.current !== owner || !mounted.current) return;
      try {
        globalThis.localStorage.removeItem(nightDraftKey(owner));
      } catch {
        /* Replaying the key returns the same night. */
      }
      router.replace(`/night/${result.nightId}${command.withPeople ? '/invite' : ''}`);
    } catch (error) {
      if (
        currentOwner.current === owner &&
        mounted.current &&
        error instanceof DataAccessError &&
        error.code === '22023'
      ) {
        attempt.current = null;
        setDraft((value) => ({ ...value, attempt: null, step: 1 }));
        setIssue('The night could not start. Update its details and try again.');
        return;
      }
      if (currentOwner.current === owner && mounted.current)
        setIssue('Could not confirm your night. Retry to recover the same start request.');
    } finally {
      inFlight.current = false;
      if (currentOwner.current === owner && mounted.current) setBusy(false);
    }
  }
  let end = new Date(now);
  try {
    end = new Date(resolveWallTimeInTimeZone(draft.date, draft.time, draft.timezone));
  } catch {
    /* Review explains invalid wall times. */
  }
  const zone = safeTimeZone(draft.timezone);
  const frozen = busy || Boolean(draft.attempt);
  const steps = ['Night details', 'People & plans', 'Review your night'];
  const updateGuest = (clientId: string, patch: Partial<NightDraft['guests'][number]>) =>
    edit({ guests: draft.guests.map((g) => (g.clientId === clientId ? { ...g, ...patch } : g)) });
  return (
    <Screen insetTop={false} scrollRef={scrollRef}>
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
          Step {draft.step} of 3
        </Text>
        <ScreenHeading title={steps[draft.step - 1] ?? 'Make a plan'} />
      </View>
      {restored || storageIssue ? (
        <Panel>
          {restored ? <Notice message="Unfinished setup restored on this device." /> : null}
          {storageIssue ? <Notice error message={storageIssue} /> : null}
          {storageIssue && !unreadable ? (
            <PrimaryButton
              label="Retry saving setup"
              variant="secondary"
              disabled={busy}
              onPress={() => {
                try {
                  globalThis.localStorage.setItem(nightDraftKey(owner), JSON.stringify(draft));
                  setStorageIssue(null);
                } catch {
                  setStorageIssue('Device storage is unavailable. Retry saving your setup.');
                }
              }}
            />
          ) : null}
          <PrimaryButton
            label="Discard setup"
            variant="quiet"
            disabled={frozen}
            onPress={discard}
          />
        </Panel>
      ) : null}
      {draft.attempt ? (
        <Notice message="A start request is waiting for confirmation. Retry it before changing this setup." />
      ) : null}
      {draft.step === 1 ? (
        <>
          <Panel>
            <TextField
              label="Night name"
              value={draft.title}
              maxLength={80}
              editable={!frozen}
              onChangeText={(title) => edit({ title })}
            />
            <DateTimeField
              label="End date"
              mode="date"
              value={end}
              timezone={zone}
              disabled={frozen}
              onChange={(date) =>
                edit({ ...wallClockFromInstant(date, zone), durationHours: null })
              }
            />
            <DateTimeField
              label="End time"
              mode="time"
              value={end}
              timezone={zone}
              disabled={frozen}
              onChange={(date) =>
                edit({ ...wallClockFromInstant(date, zone), durationHours: null })
              }
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([1, 2, 3, 4] as const).map((hours) => (
                <View key={hours} style={{ flex: 1, minWidth: 60 }}>
                  <Action
                    label={`End in ${hours} hour${hours > 1 ? 's' : ''}`}
                    disabled={frozen}
                    selected={draft.durationHours === hours}
                    onPress={() =>
                      edit({
                        ...wallClockFromInstant(new Date(Date.now() + hours * 3_600_000), zone),
                        durationHours: hours,
                      })
                    }
                    style={{
                      minHeight: 52,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: draft.durationHours === hours ? colors.primary : colors.border,
                      backgroundColor:
                        draft.durationHours === hours ? colors.primarySoft : colors.surface,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                      {hours}h
                    </Text>
                  </Action>
                </View>
              ))}
            </View>
            <TextField
              label="Time zone"
              value={draft.timezone}
              maxLength={80}
              editable={!frozen}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(timezone) => edit({ timezone, durationHours: null })}
            />
          </Panel>
          <View style={{ gap: 10 }}>
            <Choice
              label="With people"
              detail="Invite friends or log for consenting guests"
              selected={draft.withPeople}
              disabled={frozen}
              onPress={() => edit({ withPeople: true })}
            />
            <Choice
              label="Solo"
              selected={!draft.withPeople}
              disabled={frozen}
              onPress={() => edit({ withPeople: false })}
            />
          </View>
          <PrimaryButton
            label="Continue"
            disabled={!ready || frozen || !draft.title.trim()}
            onPress={() => edit({ step: 2 })}
          />
        </>
      ) : draft.step === 2 ? (
        <>
          <Text style={typography.sectionTitle}>Your plan</Text>
          <PlanEditor
            mode={draft.mode}
            items={draft.items}
            disabled={frozen}
            onModeChange={(mode) => edit({ mode })}
            onChange={(items) => edit({ items })}
          />
          {draft.withPeople ? (
            <>
              <Text style={typography.sectionTitle}>Guests you log for</Text>
              <Notice message="Friends with DWD can join by invitation and log for themselves. Only add guests who agree to you recording their drinks." />
              {draft.guests.map((guest) => (
                <Panel key={guest.clientId}>
                  <TextField
                    label="Guest name"
                    value={guest.displayName}
                    maxLength={60}
                    editable={!frozen}
                    onChangeText={(displayName) => updateGuest(guest.clientId, { displayName })}
                  />
                  <PlanEditor
                    mode={guest.mode}
                    items={guest.items}
                    disabled={frozen}
                    onModeChange={(mode) => updateGuest(guest.clientId, { mode })}
                    onChange={(items) => updateGuest(guest.clientId, { items })}
                  />
                  <SettingsRow
                    label="They agreed to me recording their drinks"
                    value={guest.consent}
                    disabled={frozen}
                    onChange={(consent) => updateGuest(guest.clientId, { consent })}
                  />
                  <PrimaryButton
                    label="Remove guest"
                    variant="danger"
                    disabled={frozen}
                    onPress={() =>
                      edit({ guests: draft.guests.filter((g) => g.clientId !== guest.clientId) })
                    }
                  />
                </Panel>
              ))}
              <PrimaryButton
                label="Add guest"
                icon="person-add-outline"
                variant="secondary"
                disabled={frozen || draft.guests.length >= 20}
                onPress={() =>
                  edit({
                    guests: [
                      ...draft.guests,
                      {
                        clientId: Crypto.randomUUID(),
                        displayName: '',
                        mode: 'unselected',
                        items: [],
                        consent: false,
                      },
                    ],
                  })
                }
              />
            </>
          ) : null}
          <PrimaryButton label="Review night" disabled={frozen} onPress={review} />
          <PrimaryButton
            label="Back to details"
            variant="quiet"
            disabled={frozen}
            onPress={() => edit({ step: 1 })}
          />
        </>
      ) : (
        <>
          <Panel>
            <Text style={typography.sectionTitle}>{draft.title}</Text>
            <Text style={typography.body}>{formatNightDateTime(end, zone)}</Text>
            <Text style={typography.body}>
              {draft.withPeople
                ? draft.guests.length
                  ? `With people · ${draft.guests.length} ${draft.guests.length === 1 ? 'guest' : 'guests'} you log for`
                  : 'With people · invite friends next'
                : 'Solo night'}
            </Text>
            <PrimaryButton
              label="Edit details"
              variant="quiet"
              disabled={frozen}
              onPress={() => edit({ step: 1 })}
            />
          </Panel>
          {[
            { displayName: 'Your plan', mode: draft.mode, items: draft.items },
            ...(draft.withPeople ? draft.guests : []),
          ].map((person, index) => (
            <Panel key={index}>
              <Text style={typography.sectionTitle}>{person.displayName}</Text>
              {person.mode === 'water_only' ? (
                <Text style={typography.body}>Chaser only</Text>
              ) : (
                person.items.map((item, i) => (
                  <Text key={i} style={typography.body}>
                    {item.plannedQuantity} × {item.label} · {item.volumeMl} ml · {item.abvPercent}%
                    ABV{item.isQuickLog ? ' · main drink' : ''}
                  </Text>
                ))
              )}
            </Panel>
          ))}
          <PrimaryButton
            label={draft.attempt ? 'Retry start request' : 'Start night'}
            icon="moon-outline"
            busy={busy}
            disabled={Boolean(storageIssue)}
            onPress={() => void start()}
          />
          <PrimaryButton
            label="Edit people & plans"
            variant="quiet"
            disabled={frozen}
            onPress={() => edit({ step: 2 })}
          />
        </>
      )}
      {issue ? <Notice error message={issue} /> : null}
    </Screen>
  );
}
