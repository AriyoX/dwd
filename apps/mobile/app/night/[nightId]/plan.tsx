import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { replacePlanSchema, type PlanItemInput, type PlanSetupMode } from '@dwd/core';
import { replaceMemberPlan } from '@dwd/data';
import { PlanEditor } from '@/components/plan-editor';
import { PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, RetryPanel, Screen } from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useSupabase } from '@/providers/supabase-provider';

export default function PlanScreen() {
  const { nightId } = useLocalSearchParams<{ nightId: string }>();
  const router = useRouter();
  const { client, session } = useSupabase();
  const { snapshot, issue: loadIssue, refresh } = useNight(nightId);
  const [items, setItems] = useState<PlanItemInput[]>([]);
  const [mode, setMode] = useState<PlanSetupMode>('unselected');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const initialized = useRef(false);
  const inFlight = useRef(false);
  const member = snapshot?.members.find((m) => m.id === snapshot.currentMemberId);
  useEffect(() => {
    if (!member || initialized.current) return;
    initialized.current = true;
    setItems(member.planItems.filter((p) => !p.archivedAt));
    setRevision(member.planRevision);
    setMode(
      member.planSetupCompletedAt === null
        ? 'unselected'
        : member.planItems.length
          ? 'drinks'
          : 'water_only',
    );
  }, [member]);
  async function save() {
    if (!client || !member || member.userId !== session?.user.id || inFlight.current) return;
    const parsed = replacePlanSchema.safeParse({
      memberId: member.id,
      items: mode === 'water_only' ? [] : items,
      expectedRevision: revision,
    });
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Check your plan.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    try {
      await replaceMemberPlan(client, member.id, parsed.data.items, parsed.data.expectedRevision);
      router.dismissTo(`/night/${nightId}`);
    } catch {
      setIssue(
        'Could not save your plan. It may have changed on another device. Close and reopen to load the latest plan.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen insetTop={false}>
      {!session ? (
        <Notice message="Sign in to set your plan." />
      ) : loadIssue && !snapshot ? (
        <RetryPanel issue={loadIssue} retry={() => void refresh()} />
      ) : !snapshot ? (
        <LoadingPanel />
      ) : snapshot.night.status !== 'active' || !member || member.leftAt !== null ? (
        <Notice message="This night is no longer active for you." />
      ) : (
        <>
          <PlanEditor
            items={items}
            onChange={setItems}
            mode={mode}
            onModeChange={setMode}
            disabled={busy}
          />
          {issue ? <Notice error message={issue} /> : null}
          <PrimaryButton
            label="Save plan"
            busy={busy}
            disabled={mode === 'unselected' || (mode === 'drinks' && items.length === 0)}
            onPress={() => void save()}
          />
        </>
      )}
    </Screen>
  );
}
