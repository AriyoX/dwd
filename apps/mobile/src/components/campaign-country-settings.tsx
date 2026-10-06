import { Text } from 'react-native';
import { UK_CALENDAR_REGIONS, defaultCalendarRegion } from '@dwd/core';
import { getPreplotPreferences, updatePreplotCountry } from '@dwd/data';
import { useAccountQuery } from '@/hooks/use-account-query';
import { useNightAction } from '@/hooks/use-night-action';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import { actorClient } from '@/lib/actor-client';
import { CountryChoice } from './country-choice';
import { Choice } from './choice';
import { LoadingPanel, Notice, Panel, RetryPanel } from './screen';

export function CampaignCountrySettings() {
  const query = useAccountQuery(getPreplotPreferences);
  const action = useNightAction(query.refresh);
  const { client, session } = useSupabase();
  const { typography } = useTheme();
  if (!query.data)
    return query.issue ? (
      <RetryPanel issue={query.issue} retry={() => void query.refresh()} />
    ) : (
      <LoadingPanel />
    );
  const preferences = query.data;
  return (
    <Panel>
      <Text accessibilityRole="header" style={typography.sectionTitle}>
        Country & holidays
      </Text>
      <CountryChoice
        value={preferences.countrySelected ? preferences.countryCode : null}
        disabled={action.busy}
        onChange={(code) => {
          if (client && session)
            void action.run(() =>
              updatePreplotCountry(
                actorClient(client, session.access_token),
                code,
                defaultCalendarRegion(code),
              ),
            );
        }}
      />
      {preferences.countryCode === 'GB'
        ? UK_CALENDAR_REGIONS.map((region) => (
            <Choice
              key={region.code}
              compact
              label={region.name}
              selected={region.code === preferences.calendarRegion}
              disabled={action.busy}
              onPress={() => {
                if (client && session)
                  void action.run(() =>
                    updatePreplotCountry(
                      actorClient(client, session.access_token),
                      'GB',
                      region.code,
                    ),
                  );
              }}
            />
          ))
        : null}
      <Notice message="Reminders use your device's local time. Choose your current country separately in Help." />
      {preferences.countryCode === 'US' || preferences.countryCode === 'CA' ? (
        <Notice message="Holiday reminders use the federal calendar." />
      ) : null}
      {action.issue ? <Notice error message={action.issue} /> : null}
    </Panel>
  );
}
