import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function DateTimeField({
  label,
  value,
  onChange,
  mode,
  timezone,
  disabled = false,
  minimumDate,
  maximumDate,
}: {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  mode: 'date' | 'time';
  timezone?: string;
  disabled?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const { colors, typography, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const props = {
    value,
    mode,
    ...(timezone ? { timeZoneName: timezone } : {}),
    ...(minimumDate ? { minimumDate } : {}),
    ...(maximumDate ? { maximumDate } : {}),
  };
  const text = value.toLocaleString([], {
    timeZone: timezone,
    ...(mode === 'date'
      ? ({ month: 'short', day: 'numeric', year: 'numeric' } as const)
      : ({ hour: 'numeric', minute: '2-digit' } as const)),
  });
  return (
    <View style={{ gap: 8 }}>
      <Action
        label={`${label}, ${text}`}
        disabled={disabled}
        expanded={open}
        onPress={() => {
          if (Platform.OS === 'android')
            DateTimePickerAndroid.open({
              ...props,
              positiveButton: { textColor: colors.primary },
              negativeButton: { textColor: colors.muted },
              onValueChange: (_, date) => onChange(date),
            });
          else setOpen(!open);
        }}
        style={{
          minHeight: 52,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: colors.surfaceSoft,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ ...typography.body, color: colors.primary }}>{text}</Text>
      </Action>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          {...props}
          disabled={disabled}
          display="spinner"
          themeVariant={scheme}
          textColor={colors.text}
          accentColor={colors.primary}
          onValueChange={(_, date) => onChange(date)}
        />
      ) : null}
    </View>
  );
}
