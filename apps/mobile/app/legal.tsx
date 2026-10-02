import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { PrimaryButton } from '@/components/primary-button';
import { Notice, Panel, Screen, ScreenHeading } from '@/components/screen';
import { siteUrl } from '@/lib/site';

export default function LegalScreen() {
  const { document } = useLocalSearchParams<{ document?: string }>();
  const terms = document === 'terms';
  const [issue, setIssue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    setIssue(null);
    try {
      await WebBrowser.openBrowserAsync(`${siteUrl()}/${terms ? 'terms' : 'privacy'}`);
    } catch {
      setIssue('Could not open the DWD website. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen insetTop={false}>
      <ScreenHeading title={terms ? 'Terms of use' : 'Privacy notice'} />
      <Panel>
        <Notice message="Read the current document on the DWD website." />
        <PrimaryButton
          label={terms ? 'Read Terms' : 'Read Privacy notice'}
          busy={busy}
          onPress={() => void open()}
        />
        {issue ? <Notice error message={issue} /> : null}
      </Panel>
    </Screen>
  );
}
