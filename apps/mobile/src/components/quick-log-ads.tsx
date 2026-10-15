import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAdDismissal } from '@dwd/contracts';
import { useTheme } from '@/providers/theme-provider';
import { TonightBanners } from './tonight-banners';

const dismissal = createAdDismissal();

export function useQuickLogAds() {
  const hidden = useSyncExternalStore(dismissal.subscribe, dismissal.isHidden);
  return hidden ? null : <QuickLogAds />;
}

function QuickLogAds() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        padding: 8,
        paddingBottom: 0,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: `${colors.border}A6`,
        backgroundColor: `${colors.surface}B3`,
        boxShadow: '0 8px 32px #160b1230',
      }}
    >
      <TonightBanners compact />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hide ads for 7 minutes"
        onPress={dismissal.dismiss}
        style={({ pressed }) => ({
          position: 'absolute',
          top: 10,
          right: 10,
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.primarySoft : `${colors.surface}E6`,
        })}
      >
        <Ionicons name="close" size={18} color={colors.text} accessible={false} />
      </Pressable>
    </View>
  );
}
