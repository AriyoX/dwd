import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function AppearancePicker() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
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
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 6,
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primarySoft : colors.surface,
              }}
            >
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={{
                  width: 46,
                  height: 64,
                  borderRadius: 10,
                  overflow: 'hidden',
                  backgroundColor: value === 'dark' ? '#21141B' : '#F8F4EF',
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 6,
                  gap: 5,
                }}
              >
                {value === 'system' ? (
                  <View
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '50%',
                      backgroundColor: '#21141B',
                    }}
                  />
                ) : null}
                <View
                  style={{
                    height: 4,
                    width: 16,
                    borderRadius: 2,
                    alignSelf: 'center',
                    backgroundColor: '#A57C90',
                  }}
                />
                <View
                  style={{ height: 20, borderRadius: 4, backgroundColor: '#A57C90', opacity: 0.55 }}
                />
                <View
                  style={{ height: 5, borderRadius: 2, backgroundColor: '#A57C90', opacity: 0.35 }}
                />
              </View>
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' }}
              >
                {label}
              </Text>
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={selected ? colors.primary : colors.muted}
                accessible={false}
              />
            </Action>
          </View>
        );
      })}
    </View>
  );
}
