import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ActiveNightSummary } from '@dwd/core';
import { getActiveNights } from '@dwd/data';
import { Brand } from '@/components/brand';
import { PrimaryButton } from '@/components/primary-button';
import { Panel, Screen, ScreenHeading } from '@/components/screen';
import { useSupabase } from '@/providers/supabase-provider';
import { colors, radii, typography } from '@/theme/tokens';

export default function TonightScreen() {
  const router = useRouter();
  const { client, session, status } = useSupabase();
  const [nights, setNights] = useState<ActiveNightSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!client || status !== 'signed-in') {
      setNights([]);
      setIssue(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    setIssue(null);
    void getActiveNights(client)
      .then((result) => {
        if (mounted) setNights(result);
      })
      .catch(() => {
        if (mounted) setIssue('Could not load your active nights.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [client, session?.user.id, status, retryKey]);

  return (
    <Screen>
      <Brand />
      <ScreenHeading title="Your evening starts here" />

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Your active nights
          </Text>
          {nights.length > 0 ? <Text style={styles.count}>{nights.length}</Text> : null}
        </View>

        {status === 'unconfigured' ? (
          <Panel>
            <Text style={styles.body}>Account connection unavailable.</Text>
          </Panel>
        ) : status === 'loading' || loading ? (
          <Panel style={styles.loadingPanel}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.body}>Loading active nights</Text>
          </Panel>
        ) : status === 'signed-out' || status === 'error' ? (
          <Panel>
            <Text style={styles.body}>Sign in to see your active nights.</Text>
            <PrimaryButton label="Sign in" onPress={() => router.push('/account')} />
          </Panel>
        ) : issue ? (
          <Panel>
            <Text accessibilityRole="alert" style={styles.body}>
              {issue}
            </Text>
            <PrimaryButton
              label="Retry"
              variant="secondary"
              onPress={() => setRetryKey((key) => key + 1)}
            />
          </Panel>
        ) : nights.length === 0 ? (
          <Panel style={styles.emptyPanel}>
            <Ionicons name="moon-outline" color={colors.muted} size={28} accessible={false} />
            <Text style={styles.body}>No active nights yet.</Text>
          </Panel>
        ) : (
          nights.map((night) => <NightCard key={night.id} night={night} />)
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.disclaimer}>DWD cannot determine sobriety or driving safety.</Text>
      </View>
    </Screen>
  );
}

function NightCard({ night }: { night: ActiveNightSummary }) {
  return (
    <Panel style={styles.nightCard}>
      <View style={styles.nightIcon}>
        <Ionicons name="moon-outline" color={colors.primary} size={22} accessible={false} />
      </View>
      <View style={styles.nightContent}>
        <View style={styles.nightStatus}>
          <View style={styles.activeDot} />
          <Text style={styles.nightStatusText}>Active</Text>
        </View>
        <Text style={styles.nightTitle}>{night.title}</Text>
        <Text style={styles.role}>{night.role === 'host' ? 'Hosting' : 'Joined'}</Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  sectionTitle: { ...typography.sectionTitle, flexShrink: 1 },
  count: {
    minWidth: 25,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
    overflow: 'hidden',
    textAlign: 'center',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingPanel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  body: { ...typography.body, flexShrink: 1 },
  emptyPanel: {
    alignItems: 'center',
    paddingVertical: 36,
    borderStyle: 'dashed',
    borderRadius: radii.resume,
    backgroundColor: 'transparent',
  },
  nightCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: radii.resume },
  nightIcon: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.icon,
    backgroundColor: colors.surfaceSoft,
  },
  nightContent: { flex: 1, minWidth: 0, gap: 8 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  nightStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  nightStatusText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  role: { color: colors.muted, fontSize: 13 },
  nightTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '600' },
  footer: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 22 },
  disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 19 },
});
