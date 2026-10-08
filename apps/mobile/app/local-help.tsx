import { CampaignCountrySettings } from '@/components/campaign-country-settings';
import { EmergencyNumbers } from '@/components/emergency-numbers';
import { Screen, ScreenHeading } from '@/components/screen';

export default function LocalHelpScreen() {
  return (
    <Screen insetTop={false}>
      <ScreenHeading title="Local help numbers" />
      <EmergencyNumbers />
      <CampaignCountrySettings />
    </Screen>
  );
}
