import { Linking, Text } from 'react-native';
import { countryProfile } from '@dwd/core';
import { useCountryLocation } from '@/providers/location-provider';
import { useTheme } from '@/providers/theme-provider';
import { PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';
import { SettingsRow } from './settings-row';

export function CampaignCountrySettings() {
  const { location, permission, busy, request, enabled, disable } = useCountryLocation();
  const { typography } = useTheme();
  return (
    <Panel>
      <SettingsRow
        label="Local emergency numbers"
        value={enabled && (busy || permission === 'granted')}
        onChange={(value) => (value ? void request() : disable())}
      />
      <Text style={typography.body}>Use your location to find local help numbers.</Text>
      <Text style={typography.body}>
        {busy ? 'Finding country…' : enabled && permission === 'granted' ? 'On' : 'Off'} ·{' '}
        {countryProfile(location.countryCode)?.name}
        {location.source === 'default' ? ' (default)' : ''}
      </Text>
      {enabled && permission === 'denied' ? (
        <>
          <Notice message="Allow location in your phone settings to turn it on." />
          <PrimaryButton
            label="Open settings"
            variant="quiet"
            onPress={() => void Linking.openSettings().catch(() => undefined)}
          />
        </>
      ) : null}
    </Panel>
  );
}
