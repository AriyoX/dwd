import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { quickCountLabel, quickLinkedNight } from '@dwd/core';
import { useQuickLog } from '@/hooks/use-quick-log';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function QuickLogEntry() {
  const { store } = useQuickLog();
  const { colors, typography } = useTheme();
  const router = useRouter();
  const current = store.session();
  const label = current ? 'Resume Quick Log' : 'Quick Log';
  return (
    <Action
      label={label}
      onPress={() => router.push('/quick-log')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
        padding: 20,
        borderRadius: 30,
        backgroundColor: colors.primarySoft,
        borderWidth: 1,
        borderColor: colors.primary,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
      }}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primaryFill,
        }}
      >
        <Ionicons name="add" size={28} color={colors.onPrimary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={typography.sectionTitle}>{label}</Text>
        {current ? (
          <Text style={typography.body}>
            {quickLinkedNight(current) ? 'Linked to your night' : quickCountLabel(current.entries)}
          </Text>
        ) : null}
      </View>
      <Ionicons name="arrow-forward" size={22} color={colors.primary} />
    </Action>
  );
}
