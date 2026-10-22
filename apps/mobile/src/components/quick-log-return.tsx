import { useRouter } from 'expo-router';
import { quickSessionForNight } from '@dwd/core';
import { useQuickLog } from '@/hooks/use-quick-log';
import { useSupabase } from '@/providers/supabase-provider';
import { PrimaryButton } from './primary-button';

export function QuickLogReturn({ nightId, memberId }: { nightId: string; memberId: string }) {
  const own = useQuickLog();
  const guest = useQuickLog(true);
  const { session: account } = useSupabase();
  const router = useRouter();
  const session = quickSessionForNight(
    [...own.state.record.sessions, ...guest.state.record.sessions].filter(
      (item) => !item.claimedBy || item.claimedBy === account?.user.id,
    ),
    nightId,
    memberId,
  );
  if (!account || !session) return null;
  return (
    <PrimaryButton
      label="Back to Quick Log"
      variant="quiet"
      onPress={() =>
        router.dismissTo({
          pathname: '/quick-log',
          params: { scope: session.scope === 'guest' ? 'guest' : 'account', sessionId: session.id },
        })
      }
    />
  );
}
