import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { readTourProgress, saveTourProgress } from '@/lib/practice-tour';
import { PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';

export function TourEntry({ owner }: { owner: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  useFocusEffect(
    useCallback(() => {
      const progress = readTourProgress(globalThis.localStorage, owner);
      setVisible(!progress || progress.status === 'active');
    }, [owner]),
  );
  if (!visible) return null;
  return (
    <Panel>
      <Notice message="Try a practice night without saving real entries." />
      <PrimaryButton
        label="Explore DWD"
        icon="compass-outline"
        variant="secondary"
        onPress={() => router.push('/tour')}
      />
      <PrimaryButton
        label="Not now"
        variant="quiet"
        onPress={() => {
          try {
            saveTourProgress(globalThis.localStorage, owner, { step: 0, status: 'skipped' });
          } catch {
            /* Only this launch is dismissed when storage is unavailable. */
          }
          setVisible(false);
        }}
      />
    </Panel>
  );
}
