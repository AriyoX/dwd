import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EMERGENCY_NUMBERS_UGANDA, EMERGENCY_SIGNS } from '@dwd/core';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen } from '@/components/screen';
import { useTheme } from '@/providers/theme-provider';

export default function HelpScreen() {
  const { colors, typography } = useTheme();
  const [issue, setIssue] = useState<string | null>(null);
  async function call(number: string) {
    setIssue(null);
    try {
      await Linking.openURL(`tel:${number}`);
    } catch {
      setIssue(`Could not open the phone. Dial ${number} directly.`);
    }
  }
  return (
    <Screen insetTop={false}>
      <Stack.Screen options={{ title: 'Get help' }} />
      <Panel>
        <Ionicons name="medical-outline" size={32} color={colors.danger} accessible={false} />
        <Text accessibilityRole="header" style={typography.sectionTitle}>
          Someone needs help
        </Text>
        <Text style={typography.body}>Uganda emergency numbers</Text>
        {EMERGENCY_NUMBERS_UGANDA.map((number) => (
          <PrimaryButton
            key={number}
            label={`Call ${number}`}
            icon="call-outline"
            variant="danger"
            onPress={() => void call(number)}
          />
        ))}
        <Notice message="Outside Uganda, call your local emergency number. A DWD check-in does not call emergency services." />
        {issue ? <Notice error message={issue} /> : null}
      </Panel>
      <Panel>
        <Text style={typography.body}>
          Stay with the person. Seek emergency help immediately if you notice any of these signs.
        </Text>
        {EMERGENCY_SIGNS.map((sign) => (
          <View key={sign} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Ionicons name="warning-outline" size={19} color={colors.danger} accessible={false} />
            <Text style={[typography.body, { flex: 1, color: colors.text }]}>{sign}</Text>
          </View>
        ))}
      </Panel>
      <Text style={typography.body}>DWD cannot determine sobriety or driving safety.</Text>
      <PrimaryButton
        label="Emergency number source"
        variant="quiet"
        onPress={() => {
          void Linking.openURL(
            'https://upf.go.ug/public-safety-crime-response-and-security-operations-update/',
          ).catch(() => setIssue('Could not open the source.'));
        }}
      />
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Numbers verified 2 October 2026 · Uganda Police Force
      </Text>
    </Screen>
  );
}
