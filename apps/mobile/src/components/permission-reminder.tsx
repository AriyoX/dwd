import { useContext } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PermissionContext } from '@/providers/permission-context';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function PermissionReminder() {
  const value = useContext(PermissionContext);
  const { colors } = useTheme();
  if (
    !value?.ready ||
    value.dismissed ||
    value.busy ||
    (!value.notificationsOff && !value.locationOff && !value.issue)
  )
    return null;
  const label =
    value.notificationsOff && value.locationOff
      ? 'Turn on notifications & location'
      : value.notificationsOff
        ? 'Turn on notifications'
        : 'Turn on location';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceRaised,
        borderRadius: 16,
        borderWidth: 0.5,
        borderColor: colors.border,
        paddingLeft: 14,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Action
        label={label}
        containerStyle={{ flex: 1 }}
        onPress={() => void value.enable()}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 52,
          paddingVertical: 10,
        }}
      >
        <Ionicons
          name={value.notificationsOff ? 'notifications-outline' : 'location-outline'}
          size={20}
          color={colors.primary}
          accessible={false}
        />
        <Text
          style={{ flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text }}
        >
          {value.issue ?? label}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} accessible={false} />
      </Action>
      <Action
        label="Dismiss permission reminder"
        onPress={value.dismiss}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="close" size={18} color={colors.muted} accessible={false} />
      </Action>
    </View>
  );
}
