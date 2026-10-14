import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/primary-button';
import { Panel, Screen } from '@/components/screen';
import { useTheme } from '@/providers/theme-provider';
export default function StartTonightScreen() {
  const router = useRouter();
  const { typography } = useTheme();
  return (
    <Screen insetTop={false} hidePermissionReminder sheetTitle="Start Tonight">
      <Panel>
        <Text accessibilityRole="header" style={typography.sectionTitle}>
          Just keeping count?
        </Text>
        <Text style={typography.body}>Log your drinks. No planning or setup.</Text>
        <PrimaryButton
          label="Quick Log"
          icon="add"
          onPress={() => router.replace('/quick-log?scope=account')}
        />
      </Panel>
      <Panel>
        <Text accessibilityRole="header" style={typography.sectionTitle}>
          Make a night of it.
        </Text>
        <Text style={typography.body}>
          Set up your night, track in detail and invite your mates.
        </Text>
        <PrimaryButton
          label="Plan a Night"
          variant="secondary"
          icon="moon-outline"
          onPress={() => router.replace('/night/new')}
        />
      </Panel>
    </Screen>
  );
}
