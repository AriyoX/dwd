import { useState } from 'react';
import { Linking, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { countryProfile, emergencyDialUri } from '@dwd/core';
import { useTheme } from '@/providers/theme-provider';
import { useCountryLocation } from '@/providers/location-provider';
import { PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';

export function EmergencyNumbers({ urgent = false }: { urgent?: boolean }) {
  const { colors, typography } = useTheme();
  const [issue, setIssue] = useState<string | null>(null);
  const { location } = useCountryLocation();
  const profile = countryProfile(location.countryCode);

  async function call(number: string) {
    const uri = emergencyDialUri(location.countryCode, number);
    if (!uri) return;
    setIssue(null);
    try {
      await Linking.openURL(uri);
    } catch {
      setIssue(`Could not open the phone. Dial ${number} directly.`);
    }
  }

  return (
    <Panel>
      {urgent ? (
        <Ionicons name="medical-outline" size={32} color={colors.muted} accessible={false} />
      ) : null}
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        {urgent ? 'Someone needs help' : 'Emergency numbers'}
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
          variant="primary"
          onPress={() => void call(number)}
        />
      ))}
      <Notice message="A DWD check-in does not call emergency services." />
      {issue ? <Notice error message={issue} /> : null}
      {profile ? (
        <>
          <PrimaryButton
            label="Emergency number source"
            variant="quiet"
            onPress={() => {
              void Linking.openURL(profile.emergencySource).catch(() =>
                setIssue('Could not open the source.'),
              );
            }}
          />
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Numbers verified {profile.reviewedAt} · {profile.emergencyAuthority}
          </Text>
        </>
      ) : null}
    </Panel>
  );
}
