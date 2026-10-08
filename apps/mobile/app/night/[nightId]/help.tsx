import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EMERGENCY_SIGNS } from '@dwd/core';
import { EmergencyNumbers } from '@/components/emergency-numbers';
import { Panel, Screen } from '@/components/screen';
import { useTheme } from '@/providers/theme-provider';

export default function HelpScreen() {
  const { colors, typography } = useTheme();
  return (
    <Screen insetTop={false} sheetTitle="Get help">
      <Stack.Screen options={{ title: 'Get help' }} />
      <EmergencyNumbers urgent />
      <Panel>
        <Text style={typography.body}>
          Stay with the person. Seek emergency help immediately if you notice any of these signs.
        </Text>
        {EMERGENCY_SIGNS.map((sign) => (
          <View key={sign} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Ionicons name="warning-outline" size={19} color={colors.danger} accessible={false} />
            <Text style={[typography.body, { flex: 1, color: colors.text }]}>{sign}</Text>
          </View>
        ))}
      </Panel>
      <Text style={typography.body}>DWD cannot determine sobriety or driving safety.</Text>
    </Screen>
  );
}
