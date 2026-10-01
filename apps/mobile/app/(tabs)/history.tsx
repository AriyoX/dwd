import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { FinishedNight } from '@dwd/core';
import { getFinishedNights } from '@dwd/data';
import { Brand } from '@/components/brand';
import { PrimaryButton } from '@/components/primary-button';
import { Panel, Screen, ScreenHeading } from '@/components/screen';
import { useSupabase } from '@/providers/supabase-provider';
import { colors, radii, typography } from '@/theme/tokens';

export default function HistoryScreen() {
  const router = useRouter();
  const { client, session, status } = useSupabase();
  const [nights, setNights] = useState<FinishedNight[]>([]);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!client || status !== 'signed-in') {
      setNights([]);
      setIssue(null);
      setLoading(false);
      setPage(0);
      setHasMore(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    setIssue(null);
    void getFinishedNights(client, page)
      .then(({ nights: result, hasMore: more }) => {
        if (mounted) {
          setNights(result);
          setHasMore(more);
        }
      })
      .catch(() => {
        if (mounted) setIssue('Could not load night history.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [client, session?.user.id, status, page, retryKey]);

  return (
    <Screen>
      <Brand />
      <ScreenHeading
        title="Night history"
        leading={
          <View style={styles.featureIcon}>
            <Ionicons name="moon-outline" color={colors.primary} size={28} accessible={false} />
          </View>
        }
      />

      {status === 'unconfigured' ? (
        <Panel>
          <Text style={styles.body}>Account connection unavailable.</Text>
        </Panel>
      ) : status === 'loading' || loading ? (
        <Panel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.body}>Loading night history</Text>
        </Panel>
      ) : status === 'signed-out' || status === 'error' ? (
        <Panel>
          <Text style={styles.body}>Sign in to see completed nights.</Text>
          <PrimaryButton label="Sign in" onPress={() => router.push('/account')} />
        </Panel>
      ) : issue ? (
        <Panel>
          <Text accessibilityRole="alert" style={styles.body}>
            {issue}
          </Text>
          <PrimaryButton
            label="Retry history"
            variant="secondary"
            onPress={() => setRetryKey((key) => key + 1)}
          />
        </Panel>
      ) : nights.length === 0 ? (
        <Panel style={styles.emptyPanel}>
          <Ionicons name="moon-outline" color={colors.primary} size={34} accessible={false} />
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            {page === 0 ? 'No finished nights yet' : 'No more nights'}
          </Text>
        </Panel>
      ) : (
        <View style={styles.list}>
          {nights.map((night, index) => (
            <HistoryCard key={night.id} night={night} index={index} />
          ))}
        </View>
      )}
      {status === 'signed-in' && !loading && !issue && (page > 0 || hasMore) ? (
        <View style={styles.pagination}>
          {page > 0 ? (
            <PrimaryButton
              label="Newer nights"
              variant="secondary"
              onPress={() => setPage((value) => value - 1)}
            />
          ) : null}
          {hasMore ? (
            <PrimaryButton
              label="Older nights"
              variant="secondary"
              onPress={() => setPage((value) => value + 1)}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function HistoryCard({ night, index }: { night: FinishedNight; index: number }) {
  const date = new Date(night.startsAt);
  const timeZone = night.timezone || 'UTC';
  return (
    <Panel style={styles.historyCard}>
      <View
        accessible
        accessibilityLabel={date.toLocaleDateString('en', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone,
        })}
        style={[
          styles.date,
          index % 3 === 1 && styles.waterDate,
          index % 3 === 2 && styles.neutralDate,
        ]}
      >
        <Text
          style={[
            styles.month,
            index % 3 === 1 && styles.waterText,
            index % 3 === 2 && styles.neutralText,
          ]}
        >
          {date.toLocaleDateString('en', { month: 'short', timeZone })}
        </Text>
        <Text
          style={[
            styles.day,
            index % 3 === 1 && styles.waterText,
            index % 3 === 2 && styles.neutralText,
          ]}
        >
          {date.toLocaleDateString('en', { day: '2-digit', timeZone })}
        </Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.meta}>
          {night.role === 'host' ? 'You hosted' : 'With friends'} ·{' '}
          {date.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone })}
        </Text>
        <Text style={styles.nightTitle}>{night.title}</Text>
        <View style={styles.counts}>
          <View style={styles.count}>
            <Ionicons name="wine-outline" color={colors.accent} size={15} accessible={false} />
            <Text style={styles.meta}>{formatCount(night.alcoholCount, 'drink')}</Text>
          </View>
          <View style={styles.count}>
            <Ionicons name="water-outline" color={colors.water} size={15} accessible={false} />
            <Text style={styles.meta}>{formatCount(night.waterCount, 'chaser')}</Text>
          </View>
        </View>
      </View>
    </Panel>
  );
}

function formatCount(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  featureIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
  },
  body: { ...typography.body, flexShrink: 1 },
  loadingPanel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  list: { gap: 16 },
  emptyPanel: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { ...typography.sectionTitle, textAlign: 'center' },
  historyCard: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  date: {
    minWidth: 57,
    minHeight: 74,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radii.icon,
    backgroundColor: colors.primarySoft,
  },
  waterDate: { backgroundColor: colors.waterSoft },
  neutralDate: { backgroundColor: colors.surfaceRaised },
  month: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  day: { color: colors.primary, fontSize: 28, lineHeight: 32, fontWeight: '500' },
  waterText: { color: colors.waterText },
  neutralText: { color: colors.text },
  cardContent: { flex: 1, minWidth: 0, gap: 9 },
  nightTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
});
