import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { countryProfile, emergencyDialUri, EMERGENCY_SIGNS } from '@dwd/core';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen } from '@/components/screen';
import { useTheme } from '@/providers/theme-provider';
import { useCountryLocation } from '@/providers/location-provider';

export default function HelpScreen() {
  const { colors, typography } = useTheme();
  const [issue, setIssue] = useState<string | null>(null);
  const { location } = useCountryLocation();
  const country = location.countryCode;
  const profile = countryProfile(country);
  async function call(number: string) {
    const uri = emergencyDialUri(country, number);
    if (!uri) return;
    setIssue(null);
    try {
      await Linking.openURL(uri);
    } catch {
      setIssue(`Could not open the phone. Dial ${number} directly.`);
    }
  }
  return (
    <Screen insetTop={false} sheetTitle="Get help">
      <Stack.Screen options={{ title: 'Get help' }} />
      <Panel>
        <Ionicons name="medical-outline" size={32} color={colors.danger} accessible={false} />
        <Text accessibilityRole="header" style={typography.sectionTitle}>
          Someone needs help
        </Text>
        <Text style={typography.sectionTitle}>
          {profile?.name}
          {location.source === 'default' ? ' (default)' : ''}
        </Text>
        {location.source === 'default' ? (
          <Notice message="Location is unavailable or unsupported. These numbers are for Uganda. If you are elsewhere, dial your local emergency number or ask someone nearby." />
        ) : (
          <Notice message="Location is approximate. Check that these emergency numbers apply where you are." />
        )}
        {profile?.emergency.map(({ number, service }) => (
          <PrimaryButton
            key={number}
            label={`Call ${number} · ${service}`}
            icon="call-outline"
            variant="danger"
            onPress={() => void call(number)}
          />
        ))}
        <Notice message="A DWD check-in does not call emergency services." />
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
      {profile ? (
        <PrimaryButton
          label="Emergency number source"
          variant="quiet"
          onPress={() => {
            void Linking.openURL(profile.emergencySource).catch(() =>
              setIssue('Could not open the source.'),
            );
          }}
        />
      ) : null}
      {profile ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Numbers verified {profile.reviewedAt} · {profile.emergencyAuthority}
        </Text>
      ) : null}
    </Screen>
  );
}
