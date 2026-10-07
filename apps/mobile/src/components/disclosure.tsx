import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

/** A shared, labelled expander. Hidden controls keep their state when reopened. */
export function Disclosure({
  title,
  detail,
  children,
  defaultExpanded = false,
  disabled = false,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={{ gap: expanded ? 12 : 0 }}>
      <Action
        label={detail ? `${title}. ${detail}` : title}
        expanded={expanded}
        disabled={disabled}
        onPress={() => setExpanded((value) => !value)}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>{title}</Text>
          {detail ? <Text style={{ color: colors.muted, fontSize: 14 }}>{detail}</Text> : null}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.primary}
          accessible={false}
        />
      </Action>
      <View
        style={{ display: expanded ? 'flex' : 'none', gap: 12 }}
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      >
        {children}
      </View>
    </View>
  );
}
