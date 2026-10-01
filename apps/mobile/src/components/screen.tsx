import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, typography } from '@/theme/tokens';

export function Screen({
  children,
  contentStyle,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function ScreenHeading({ title, leading }: { title: string; leading?: ReactNode }) {
  return (
    <View style={styles.heading}>
      {leading}
      <Text accessibilityRole="header" style={styles.title}>
        {title}
        <Text style={styles.headingDot}>.</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 28,
  },
  heading: { gap: 20 },
  title: typography.heading,
  headingDot: { color: colors.primary },
  panel: {
    padding: 22,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 16,
  },
});
