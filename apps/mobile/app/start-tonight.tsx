import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Action } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useTheme } from '@/providers/theme-provider';
export default function StartTonightScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  return (
    <Screen insetTop={false} hidePermissionReminder sheetTitle="Start Tonight">
      {(
        [
          {
            label: 'Quick Log',
            detail: 'Keep count. No setup.',
            icon: 'add',
            path: '/quick-log?scope=account',
          },
          {
            label: 'Plan a Night',
            detail: 'Detailed tracking with your mates.',
            icon: 'moon-outline',
            path: '/night/new',
          },
        ] as const
      ).map((choice, index) => (
        <Action
          key={choice.label}
          label={choice.label}
          onPress={() => router.replace(choice.path)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            padding: 20,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: index === 0 ? colors.primary : colors.border,
            backgroundColor: index === 0 ? colors.primarySoft : colors.surface,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={choice.icon} size={26} color={colors.primary} accessible={false} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.sectionTitle}>{choice.label}</Text>
            <Text style={typography.body}>{choice.detail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} accessible={false} />
        </Action>
      ))}
    </Screen>
  );
}
