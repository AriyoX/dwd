import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  replacePlanSchema,
  type MemberSnapshot,
  type NightSnapshot,
  type PlanItemInput,
  type PlanSetupMode,
} from '@dwd/core';
import { replaceMemberPlan } from '@dwd/data';
import { PlanEditor } from '@/components/plan-editor';
import { PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, RetryPanel, Screen } from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useNightAction } from '@/hooks/use-night-action';
import { nightAccess } from '@/lib/night-features';
import { useSupabase } from '@/providers/supabase-provider';

export default function PlanScreen() {
  const { nightId, memberId } = useLocalSearchParams<{ nightId: string; memberId?: string }>();
  const { snapshot, issue, refresh } = useNight(nightId);
  const access = snapshot ? nightAccess(snapshot, memberId ?? snapshot.currentMemberId) : null;
  return (
    <Screen insetTop={false} sheetTitle="Your plan">
      <Stack.Screen
        options={{
          title:
            access?.member && access.member.id !== snapshot?.currentMemberId
              ? `${access.member.displayName}’s plan`
              : 'Your plan',
        }}
      />
      {!snapshot ? (
        issue ? (
          <RetryPanel issue={issue} retry={() => void refresh()} />
        ) : (
          <LoadingPanel />
        )
      ) : !access?.canEdit || !access.member ? (
        <Notice message="You cannot edit this person’s plan or the night has ended." />
      ) : (
        <MemberPlan
          key={`${snapshot.currentUserId}:${access.member.id}`}
          snapshot={snapshot}
          member={access.member}
          refresh={refresh}
        />
      )}
    </Screen>
  );
}

function MemberPlan({
  snapshot,
  member,
  refresh,
}: {
  snapshot: NightSnapshot;
  member: MemberSnapshot;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const { client } = useSupabase();
  const [items, setItems] = useState<PlanItemInput[]>(() =>
    member.planItems.filter((p) => !p.archivedAt),
  );
  const [mode, setMode] = useState<PlanSetupMode>(() =>
    member.planSetupCompletedAt === null ? 'unselected' : items.length ? 'drinks' : 'water_only',
  );
  const [revision] = useState(member.planRevision);
  const [initial] = useState(() => JSON.stringify([mode, items]));
  const dirty = initial !== JSON.stringify([mode, items]);
  const [issue, setIssue] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const action = useNightAction(refresh);
  async function save() {
    if (!client || editing || !nightAccess(snapshot, member.id).canEdit || mode === 'unselected')
      return;
    const parsed = replacePlanSchema.safeParse({
      memberId: member.id,
      items: mode === 'water_only' ? [] : items,
      expectedRevision: revision,
    });
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Check the plan.');
      return;
    }
    setIssue(null);
    await action.run(
      () => replaceMemberPlan(client, member.id, parsed.data.items, parsed.data.expectedRevision),
      undefined,
      () => router.dismissTo(`/night/${snapshot.night.id}`),
    );
  }
  return (
    <>
      <PlanEditor
        items={items}
        onChange={setItems}
        mode={mode}
        onModeChange={setMode}
        disabled={action.busy}
        onEditingChange={setEditing}
      />
      <PrimaryButton
        label="Choose a shared bottle"
        icon="wine-outline"
        variant="quiet"
        disabled={action.busy || dirty || editing}
        onPress={() =>
          router.push({
            pathname: `/night/${snapshot.night.id}/bottles`,
            params: { memberId: member.id },
          })
        }
      />
      {dirty ? <Notice message="Save plan changes before choosing a bottle." /> : null}
      {member.planRevision !== revision ? (
        <Notice message="This plan changed on another device. Close and reopen to load the latest plan." />
      ) : null}
      {issue || action.issue ? <Notice error message={issue ?? action.issue ?? ''} /> : null}
      <PrimaryButton
        label="Save plan"
        busy={action.busy}
        disabled={
          editing ||
          mode === 'unselected' ||
          (mode === 'drinks' && !items.length) ||
          member.planRevision !== revision
        }
        onPress={() => void save()}
      />
    </>
  );
}
