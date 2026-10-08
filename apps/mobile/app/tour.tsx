import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useFeatureTour } from '@/providers/feature-tour-provider';

export default function TourScreen() {
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const start = useFeatureTour()?.start;
  useEffect(() => {
    start?.(replay === '1' ? '/account' : '/');
  }, [start, replay]);
  return null;
}
