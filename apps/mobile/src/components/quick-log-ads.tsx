import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAdDismissal } from '@dwd/contracts';
import { useTheme } from '@/providers/theme-provider';
import { darkColors } from '@/theme/tokens';
import { TonightBanners } from './tonight-banners';

const dismissal = createAdDismissal();

export function useQuickLogAds() {
  const hidden = useSyncExternalStore(dismissal.subscribe, dismissal.isHidden);
  return hidden ? null : <QuickLogAds />;
}

function QuickLogAds() {
  const { colors, reduceTransparency } = useTheme();
  return (
    <View
      style={{
        // Keep the previous banner width after removing the 8px frame and border.
        marginHorizontal: 9,
        borderRadius: 20,
        boxShadow: '0 8px 32px #160b1230',
      }}
    >
      <TonightBanners compact />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hide ads for 7 minutes"
        onPress={dismissal.dismiss}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
        }}
      >
        {({ pressed }) => (
          <View
            pointerEvents="none"
            style={{
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: `${darkColors.text}24`,
              backgroundColor: `${colors.shadow}${reduceTransparency ? 'FF' : pressed ? 'A6' : '66'}`,
            }}
          >
            <Ionicons name="close" size={16} color={darkColors.text} accessible={false} />
          </View>
        )}
      </Pressable>
    </View>
  );
}
