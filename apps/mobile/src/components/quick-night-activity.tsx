import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  hasUnknownAmounts,
  hasQuickLogs,
  quickCountLabel,
  quickKindLabel,
  quickCorrectionKind,
  RECENT_CORRECTION_MINUTES,
  type MemberSnapshot,
} from '@dwd/core';
import { correctNightQuickLog } from '@dwd/data';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { actorClient } from '@/lib/actor-client';
import { Action, PrimaryButton } from './primary-button';
import { Notice } from './screen';

export function QuickNightActivity({
  member,
  refresh,
}: {
  member: MemberSnapshot;
  refresh?: () => Promise<void>;
}) {
  const { session, client } = useSupabase();
  const { typography } = useTheme();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [issue, setIssue] = useState<string | null>(null);
  if (!hasQuickLogs(member.quickLogs)) return null;
  async function correct(id: string, kind: 'drink' | 'chaser' | 'shot' | 'remove') {
    if (!client || !session || busy) return;
    setBusy(true);
    setIssue(null);
    try {
      await correctNightQuickLog(actorClient(client, session.access_token), id, kind);
      await refresh?.();
    } catch {
      setIssue('Couldn’t correct this entry. Check your connection and the correction window.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Text style={typography.sectionTitle}>
        Quick Log · {quickCountLabel(member.quickLogs ?? [])}
      </Text>
      {hasUnknownAmounts(member.quickLogs) ? (
        <Notice message="Drink amounts not recorded. Measured alcohol subtotal is incomplete." />
      ) : null}
      <Action
        label="Quick Log entries"
        expanded={expanded}
        onPress={() => setExpanded((v) => !v)}
        style={{ justifyContent: 'center' }}
      >
        <Text style={typography.body}>{expanded ? 'Hide' : 'View'} Quick Log entries</Text>
      </Action>
      {expanded &&
        member.quickLogs
          ?.filter((e) => !e.deletedAt)
          .map((e) => (
            <View key={e.id} style={{ gap: 6 }}>
              <Text style={typography.body}>
                Quick log · {quickKindLabel(e.kind)} · {new Date(e.recordedAt).toLocaleString()}
              </Text>
              {e.earlierLogging ? (
                <Text style={typography.body}>Earlier logging · before this night started</Text>
              ) : null}
              {refresh &&
              e.actorUserId === session?.user.id &&
              now - Date.parse(e.createdAt) <= RECENT_CORRECTION_MINUTES * 60_000 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <PrimaryButton
                    label={`Change to ${quickKindLabel(quickCorrectionKind(e.kind))}`}
                    variant="quiet"
                    disabled={busy}
                    onPress={() => void correct(e.id, quickCorrectionKind(e.kind))}
                  />
                  <PrimaryButton
                    label="Remove quick entry"
                    variant="quiet"
                    disabled={busy}
                    onPress={() => void correct(e.id, 'remove')}
                  />
                </View>
              ) : null}
            </View>
          ))}
      {issue ? <Notice error message={issue} /> : null}
    </View>
  );
}
