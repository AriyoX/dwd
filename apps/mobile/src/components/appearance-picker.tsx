import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function AppearancePicker() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 12 }}>
      {(['system', 'light', 'dark'] as const).map((value) => {
        const selected = preference === value;
        const label = value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark';
        return (
          <View key={value} style={{ flex: 1, minWidth: 80 }}>
            <Action
              label={`${label} appearance`}
              selected={selected}
              onPress={() => setPreference(value)}
              style={{
                alignItems: 'center',
                minHeight: 64,
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 6,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primarySoft : colors.surface,
              }}
            >
              <Ionicons
                name={
                  selected
                    ? 'checkmark-circle'
                    : value === 'dark'
                      ? 'moon-outline'
                      : value === 'light'
                        ? 'sunny-outline'
                        : 'phone-portrait-outline'
                }
                size={20}
                color={selected ? colors.primary : colors.muted}
                accessible={false}
              />
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' }}
              >
                {label}
              </Text>
            </Action>
          </View>
        );
      })}
    </View>
  );
}
