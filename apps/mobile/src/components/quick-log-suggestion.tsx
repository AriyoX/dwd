import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { quickCountLabel } from '@dwd/core';
import { useQuickLog } from '@/hooks/use-quick-log';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

const seen = new Set<string>();

export function QuickLogSuggestion() {
  const { session, status } = useSupabase();
  const own = useQuickLog();
  const guest = useQuickLog(true);
  const { colors, typography } = useTheme();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const evaluated = useRef<string | null>(null);
  const key = `dwd.quick-log.suggestion.v1:${session?.user.id ?? 'guest'}`;
  const guestSession = guest.store.session();
  const current = own.store.session() ?? (guestSession?.claimedBy ? undefined : guestSession);
  const destination = current?.scope === 'guest' ? '/quick-log?scope=guest' : '/quick-log';

  useEffect(() => {
    if (status === 'loading' || evaluated.current === key) return;
    evaluated.current = key;
    let dismissed = seen.has(key);
    try {
      dismissed ||= localStorage.getItem(key) === 'seen';
      localStorage.setItem(key, 'seen');
    } catch {
      // In-memory dismissal still works when device storage is unavailable.
    }
    seen.add(key);
    queueMicrotask(() => setVisible(!dismissed));
  }, [key, status]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (alive && !enabled) timer = setTimeout(() => setVisible(false), 15000);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <View style={{ padding: 16, borderRadius: 22, backgroundColor: colors.surfaceSoft, gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text style={{ ...typography.body, flex: 1 }}>Just keeping count?</Text>
        <Action
          label="Dismiss Quick Log suggestion"
          onPress={() => setVisible(false)}
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={20} color={colors.muted} accessible={false} />
        </Action>
      </View>
      <Action
        label={current ? 'Resume Quick Log' : 'Log now'}
        onPress={() => {
          setVisible(false);
          router.push(destination);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '600' }}>
            {current ? 'Resume Quick Log' : 'Log now'}
          </Text>
          {current ? (
            <Text style={{ ...typography.body, color: colors.muted, fontSize: 13 }}>
              {quickCountLabel(current.entries)}
            </Text>
          ) : null}
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.primary} accessible={false} />
      </Action>
    </View>
  );
}
