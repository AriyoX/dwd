import { Text } from 'react-native';
import { countryProfile, LOCATION_DISCLOSURE } from '@dwd/core';
import { useCountryLocation } from '@/providers/location-provider';
import { useTheme } from '@/providers/theme-provider';
import { PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';

export function CampaignCountrySettings() {
  const { location, permission, busy, request } = useCountryLocation();
  const { typography } = useTheme();
  return (
    <Panel>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        {countryProfile(location.countryCode)?.name}
        {location.source === 'default' ? ' (default)' : ''}
      </Text>
      <Notice message={LOCATION_DISCLOSURE} />
      {permission === 'unknown' ? (
        <PrimaryButton label="Use device location" busy={busy} onPress={() => void request()} />
      ) : null}
      {permission === 'denied' ? (
        <Notice message="Location access is off. You can enable it in your device settings." />
      ) : null}
      {location.countryCode === 'US' || location.countryCode === 'CA' ? (
        <Notice message="Holiday reminders use the federal calendar." />
      ) : null}
    </Panel>
  );
}
