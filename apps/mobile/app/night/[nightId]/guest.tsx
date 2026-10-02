import { useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { NightSnapshot, PlanItemInput, PlanSetupMode } from '@dwd/core';
import { addManagedGuest } from '@dwd/data';
import * as Crypto from 'expo-crypto';
import { PlanEditor } from '@/components/plan-editor';
import { PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, RetryPanel, Screen } from '@/components/screen';
import { SettingsRow } from '@/components/settings-row';
import { TextField } from '@/components/text-field';
import { useNight } from '@/hooks/use-night';
import { useNightAction } from '@/hooks/use-night-action';
import { materializeGuest, nightAccess } from '@/lib/night-features';
import { useSupabase } from '@/providers/supabase-provider';

export default function GuestScreen() {
  const { nightId } = useLocalSearchParams<{ nightId: string }>();
  const { snapshot, issue, refresh } = useNight(nightId);
  return (
    <Screen insetTop={false}>
      <Stack.Screen options={{ title: 'Add person' }} />
      {!snapshot ? (
        issue ? (
          <RetryPanel issue={issue} retry={() => void refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : !nightAccess(snapshot).canAddGuest ? (
        <Notice message="Only the active host can add a person to track." />
      ) : (
        <GuestForm
          key={`${snapshot.currentUserId}:${nightId}`}
          snapshot={snapshot}
          refresh={refresh}
        />
      )}
    </Screen>
  );
}

function GuestForm({
  snapshot,
  refresh,
}: {
  snapshot: NightSnapshot;
  refresh: () => Promise<void>;
}) {
  const { client } = useSupabase();
  const router = useRouter();
  const [name, setName] = useState('');
  const [items, setItems] = useState<PlanItemInput[]>([]);
  const [mode, setMode] = useState<PlanSetupMode>('unselected');
  const [consent, setConsent] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const key = useRef(Crypto.randomUUID());
  const action = useNightAction(refresh);
  async function save() {
    if (!client || !consent || !nightAccess(snapshot).canAddGuest) return;
    const parsed = materializeGuest(name, mode, items);
    if (!parsed.success) {
      setIssue(parsed.message);
      return;
    }
    setIssue(null);
    await action.run(
      () =>
        addManagedGuest(
          client,
          snapshot.night.id,
          parsed.data.displayName,
          parsed.data.planItems,
          key.current,
        ),
      undefined,
      (next) => {
        const added = next.members.find(
          (m) =>
            m.managedByUserId === next.currentUserId &&
            !snapshot.members.some((old) => old.id === m.id),
        );
        router.dismissTo({
          pathname: `/night/${snapshot.night.id}`,
          params: added ? { memberId: added.id } : {},
        });
      },
    );
  }
  return (
    <>
      <Notice message="You’ll log their drinks for them. Ask their permission first: their name, plan and entries are visible to people in this night." />
      <TextField
        label="Display name"
        maxLength={60}
        value={name}
        editable={!action.busy}
        onChangeText={setName}
      />
      <SettingsRow
        label="They agreed to be tracked"
        value={consent}
        disabled={action.busy}
        onChange={setConsent}
      />
      <PlanEditor
        items={items}
        onChange={setItems}
        mode={mode}
        onModeChange={setMode}
        disabled={action.busy}
      />
      {issue || action.issue ? <Notice error message={issue ?? action.issue ?? ''} /> : null}
      <PrimaryButton
        label="Add person"
        icon="person-add-outline"
        busy={action.busy}
        disabled={
          !consent || !name.trim() || mode === 'unselected' || (mode === 'drinks' && !items.length)
        }
        onPress={() => void save()}
      />
      <Notice message="To let them log their own drinks, close this sheet and share a night invite." />
    </>
  );
}
