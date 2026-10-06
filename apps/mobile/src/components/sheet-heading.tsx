import { Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

// Android native-stack form sheets do not render the navigation header.
export function SheetHeading({ title }: { title: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  if (Platform.OS !== 'android') return null;
  return (
    <View
      style={{
        width: '100%',
        maxWidth: 600,
        alignSelf: 'center',
        paddingHorizontal: 22,
        paddingTop: 8,
        paddingBottom: 4,
        gap: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ flex: 1, fontSize: 18, fontWeight: '600', color: colors.text }}
      >
        {title}
      </Text>
      <Action
        label={`Close ${title.toLowerCase()}`}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="close-outline" size={24} color={colors.primary} accessible={false} />
      </Action>
    </View>
  );
}
