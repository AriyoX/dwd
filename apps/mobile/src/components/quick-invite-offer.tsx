import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { availableQuickEntries, quickCountLabel } from '@dwd/core';
import { nativeQuickOffer, nativeQuickStore } from '@/lib/quick-log';
import { PrimaryButton } from './primary-button';
import { Panel, Notice } from './screen';
import { useTheme } from '@/providers/theme-provider';

export function QuickInviteOffer({
  accountId,
  nightId,
  nightTitle,
  onNotNow,
}: {
  accountId: string;
  nightId: string;
  nightTitle: string;
  onNotNow: () => void;
}) {
  const [offer] = useState(() => nativeQuickOffer(accountId));
  const router = useRouter();
  const { typography } = useTheme();
  if (!offer) return null;
  const store = nativeQuickStore(offer.scope);
  const session = store.session(offer.sessionId);
  return (
    <Panel>
      <Text style={typography.sectionTitle}>
        Add your {quickCountLabel(availableQuickEntries(session))} to {nightTitle}?
      </Text>
      <Notice message="New drinks will use this night’s plan." />
      <PrimaryButton
        label="Add logs"
        onPress={() => {
          store.setIntent({
            sessionId: offer.sessionId,
            accountId,
            nightId,
            destination: 'choose',
          });
          router.replace({
            pathname: '/quick-transfer',
            params: {
              scope: offer.scope === 'guest' ? 'guest' : 'account',
              sessionId: offer.sessionId,
              nightId,
            },
          });
        }}
      />
      <PrimaryButton label="Not now" variant="quiet" onPress={onNotNow} />
    </Panel>
  );
}
