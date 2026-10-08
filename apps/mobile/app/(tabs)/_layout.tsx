import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/providers/theme-provider';

export default function TabLayout() {
  const { colors, reduceTransparency } = useTheme();
  return (
    <NativeTabs
      tintColor={colors.primary}
      backgroundColor={colors.surface}
      blurEffect={reduceTransparency ? 'none' : 'systemChromeMaterial'}
      disableTransparentOnScrollEdge={reduceTransparency}
      minimizeBehavior="never"
      iconColor={{ default: colors.muted, selected: colors.primary }}
      labelStyle={{ default: { color: colors.muted }, selected: { color: colors.primary } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'moon', selected: 'moon.fill' }} md="dark_mode" />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Icon sf="clock" md="history" />
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
        <NativeTabs.Trigger.Label>My account</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
