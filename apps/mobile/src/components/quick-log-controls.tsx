import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlanItemInput } from '@dwd/core';
import { useTheme } from '@/providers/theme-provider';
import { Action, PrimaryButton } from './primary-button';

/** Keep the familiar Quick Log controls in both local sessions and planned nights. */
export function QuickLogControls({
  label,
  accessibleLabel = label,
  detail,
  mainDrink,
  disabled = false,
  busy = false,
  canUndo = true,
  undoDisabled,
  onLog,
  onChaser,
  onUndo,
  onChoose,
  undoLabel = 'Undo',
  children,
}: {
  label: string;
  accessibleLabel?: string;
  detail?: string;
  mainDrink?: Pick<PlanItemInput, 'label' | 'volumeMl' | 'abvPercent'> | undefined;
  disabled?: boolean;
  busy?: boolean;
  canUndo?: boolean;
  undoDisabled?: boolean;
  onLog: () => void;
  onChaser: () => void;
  onUndo: () => void;
  onChoose?: (() => void) | undefined;
  undoLabel?: string;
  children?: ReactNode;
}) {
  const { colors, typography } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const size = Math.min(width - 76, Math.max(232, 168 * fontScale));
  return (
    <View style={{ alignItems: 'center', gap: 16, paddingVertical: 8 }}>
      {mainDrink ? (
        <View
          accessible
          accessibilityLabel={`Main drink: ${mainDrink.label}. ${detail ?? `${mainDrink.volumeMl} ml, ${mainDrink.abvPercent}%`}`}
          style={{
            alignSelf: 'stretch',
            padding: 14,
            borderRadius: 18,
            gap: 5,
            borderWidth: 1,
            borderColor: colors.selectedBorder,
            backgroundColor: colors.primarySoft,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} accessible={false} />
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
              Main drink
            </Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '600' }}>
            {mainDrink.label}
          </Text>
          <Text style={typography.body}>
            {detail ?? `${mainDrink.volumeMl} ml · ${mainDrink.abvPercent}%`}
          </Text>
        </View>
      ) : null}
      <Action
        label={accessibleLabel}
        disabled={disabled || busy}
        busy={busy}
        onPress={onLog}
        containerStyle={{ width: size, maxWidth: '100%' }}
        style={{
          width: '100%',
          minHeight: size,
          padding: 24,
          gap: 12,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: 999,
          backgroundColor: colors.primaryFill,
          borderWidth: 6,
          borderColor: colors.primarySoft,
        }}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} accessible={false} />
        ) : (
          <Ionicons name="add" size={52} color={colors.onPrimary} accessible={false} />
        )}
        <Text
          style={{
            color: colors.onPrimary,
            fontSize: 22,
            fontWeight: '600',
            textAlign: 'center',
            flexShrink: 1,
          }}
        >
          {label}
        </Text>
      </Action>
      {!mainDrink && detail ? (
        <Text style={{ ...typography.body, textAlign: 'center' }}>{detail}</Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <PrimaryButton
          label="Chaser"
          icon="water-outline"
          variant="water"
          disabled={disabled || busy}
          onPress={onChaser}
        />
        <PrimaryButton
          label={undoLabel}
          icon="arrow-undo-outline"
          variant="quiet"
          disabled={(undoDisabled ?? disabled) || busy || !canUndo}
          onPress={onUndo}
        />
      </View>
      {onChoose ? (
        <PrimaryButton
          label="Choose another drink"
          variant="secondary"
          disabled={disabled || busy}
          onPress={onChoose}
        />
      ) : null}
      {children}
    </View>
  );
}
