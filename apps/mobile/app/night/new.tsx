import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import {
  startNightSchema,
  type PlanItemInput,
  type PlanSetupMode,
  type StartNightInput,
} from '@dwd/core';
import { startNightOut } from '@dwd/data';
import { Choice } from '@/components/choice';
import { PlanEditor } from '@/components/plan-editor';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen, ScreenHeading } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

export default function NewNightScreen() {
  const router = useRouter();
  const { client, status } = useSupabase();
  const { typography } = useTheme();
  const [title, setTitle] = useState('Tonight');
  const [hours, setHours] = useState(2);
  const [mode, setMode] = useState<PlanSetupMode>('unselected');
  const [items, setItems] = useState<PlanItemInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const command = useRef<StartNightInput | null>(null);
  const creationKey = useRef(Crypto.randomUUID());
  const inFlight = useRef(false);
  function edit() {
    if (!busy) command.current = null;
  }
  async function start() {
    if (!client || status !== 'signed-in' || inFlight.current) return;
    if (mode === 'unselected') {
      setIssue('Choose water only or a drink plan.');
      return;
    }
    if (mode === 'drinks' && items.length === 0) {
      setIssue('Choose at least one drink.');
      return;
    }
    command.current ??= {
      creationKey: creationKey.current,
      title,
      endsAt: new Date(Date.now() + hours * 3_600_000).toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      withPeople: true,
      hostPlanItems: mode === 'water_only' ? [] : items,
      guests: [],
    };
    const parsed = startNightSchema.safeParse(command.current);
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Check your night details.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    try {
      const result = await startNightOut(client, parsed.data);
      router.replace(`/night/${result.nightId}`);
    } catch {
      setIssue('Could not start your night. Retry to check and save the same request.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen insetTop={false}>
      <ScreenHeading title="Make a plan" />
      {status !== 'signed-in' ? (
        <Panel>
          <Notice message="Sign in to start a night." />
          <PrimaryButton label="Sign in" onPress={() => router.replace('/account')} />
        </Panel>
      ) : (
        <>
          <Panel>
            <TextField
              label="Night name"
              value={title}
              maxLength={80}
              onChangeText={(value) => {
                edit();
                setTitle(value);
              }}
            />
            <Text accessibilityRole="header" style={typography.sectionTitle}>
              Planned duration
            </Text>
            <View style={{ gap: 8 }}>
              {[1, 2, 3, 4].map((value) => (
                <Choice
                  key={value}
                  label={`${value} hour${value > 1 ? 's' : ''}`}
                  selected={hours === value}
                  disabled={busy}
                  onPress={() => {
                    edit();
                    setHours(value);
                  }}
                />
              ))}
            </View>
          </Panel>
          <Text accessibilityRole="header" style={typography.sectionTitle}>
            Your plan
          </Text>
          <PlanEditor
            items={items}
            mode={mode}
            disabled={busy}
            onChange={(value) => {
              edit();
              setItems(value);
            }}
            onModeChange={(value) => {
              edit();
              setMode(value);
            }}
          />
          {issue ? <Notice error message={issue} /> : null}
          <PrimaryButton
            label="Start night"
            busy={busy}
            disabled={
              !title.trim() || mode === 'unselected' || (mode === 'drinks' && items.length === 0)
            }
            onPress={() => void start()}
          />
        </>
      )}
    </Screen>
  );
}
