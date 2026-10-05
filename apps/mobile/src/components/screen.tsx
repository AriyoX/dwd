import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ReactNode, Ref } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/providers/theme-provider';
import { radii } from '@/theme/tokens';
import { PrimaryButton } from './primary-button';
import { SheetHeading } from './sheet-heading';

export function Screen({
  children,
  contentStyle,
  refreshControl,
  insetTop = true,
  footer,
  scrollRef,
  sheetTitle,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ScrollViewProps['refreshControl'];
  insetTop?: boolean;
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
  sheetTitle?: string;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      edges={
        footer
          ? ['top', 'bottom', 'left', 'right']
          : insetTop
            ? ['top', 'left', 'right']
            : ['left', 'right']
      }
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {sheetTitle ? <SheetHeading title={sheetTitle} /> : null}
      <ScrollView
        ref={scrollRef}
        automaticallyAdjustKeyboardInsets
        nestedScrollEnabled
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          {
            flexGrow: 1,
            alignSelf: 'center',
            width: '100%',
            maxWidth: 600,
            paddingHorizontal: 22,
            paddingTop: 16,
            paddingBottom: 40,
            gap: 24,
          },
          contentStyle,
        ]}
        refreshControl={refreshControl}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 600,
            paddingHorizontal: 22,
            paddingTop: 12,
            paddingBottom: 8,
          }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          padding: 20,
          borderRadius: radii.card,
          borderWidth: 0.5,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderCurve: 'continuous',
          gap: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function ScreenHeading({ title, leading }: { title: string; leading?: ReactNode }) {
  const { typography } = useTheme();
  return (
    <View style={{ gap: 20 }}>
      {leading}
      <Text accessibilityRole="header" style={typography.heading}>
        {title}
      </Text>
    </View>
  );
}
export function Notice({ message, error = false }: { message: string; error?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole={error ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={{
        color: error ? colors.danger : colors.muted,
        fontSize: 15,
        lineHeight: 23,
        ...(error ? { padding: 14, borderRadius: 14, backgroundColor: colors.surfaceSoft } : {}),
      }}
    >
      {message}
    </Text>
  );
}
export function LoadingPanel() {
  const { colors } = useTheme();
  return (
    <Panel>
      <ActivityIndicator accessibilityLabel="Loading" color={colors.primary} />
    </Panel>
  );
}
export function RetryPanel({ issue, retry }: { issue: string; retry: () => void }) {
  return (
    <Panel>
      <Notice error message={issue} />
      <PrimaryButton label="Retry" variant="secondary" onPress={retry} />
    </Panel>
  );
}
