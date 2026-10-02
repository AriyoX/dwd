import { Text, View } from 'react-native';
import { DRINK_PRESETS, presetToPlanItem, type PlanItemInput } from '@dwd/core';
import { useTheme } from '@/providers/theme-provider';
import { Choice } from './choice';
import { Action } from './primary-button';
import { Panel } from './screen';

export function PlanEditor({
  items,
  onChange,
  mode,
  onModeChange,
  disabled = false,
}: {
  items: PlanItemInput[];
  onChange: (items: PlanItemInput[]) => void;
  mode: 'unselected' | 'water_only' | 'drinks';
  onModeChange: (mode: 'water_only' | 'drinks') => void;
  disabled?: boolean;
}) {
  const { colors, typography } = useTheme();
  function togglePreset(id: string) {
    const preset = DRINK_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const existing = items.find(
      (item) =>
        !item.sharedBottleId && item.label === preset.label && item.category === preset.category,
    );
    const next = existing
      ? items.filter((item) => item !== existing)
      : [...items, presetToPlanItem(preset)];
    onChange(
      next.map((item, index) => ({
        ...item,
        isQuickLog: next.some((p) => p.isQuickLog) ? item.isQuickLog : index === 0,
      })),
    );
  }
  function remove(index: number) {
    const next = items.filter((_, i) => i !== index);
    onChange(
      next.map((item, i) => ({
        ...item,
        isQuickLog: next.some((p) => p.isQuickLog) ? item.isQuickLog : i === 0,
      })),
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <Choice
        label="Chaser only"
        selected={mode === 'water_only'}
        disabled={disabled}
        onPress={() => onModeChange('water_only')}
      />
      <Choice
        label="Plan drinks"
        selected={mode === 'drinks'}
        disabled={disabled}
        onPress={() => onModeChange('drinks')}
      />
      {mode === 'drinks' ? (
        <>
          <Text accessibilityRole="header" style={typography.sectionTitle}>
            Choose drinks
          </Text>
          {DRINK_PRESETS.map((preset) => (
            <Choice
              key={preset.id}
              label={preset.label}
              detail={`${preset.volumeMl} ml · ${preset.abvPercent}% ABV${preset.estimate ? ' · estimate' : ''}`}
              selected={items.some(
                (item) =>
                  !item.sharedBottleId &&
                  item.label === preset.label &&
                  item.category === preset.category,
              )}
              disabled={disabled}
              onPress={() => togglePreset(preset.id)}
            />
          ))}
          {items.map((item, index) => (
            <Panel key={item.id ?? `${item.label}:${index}`}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
                {item.label}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <Action
                  label={`Plan fewer ${item.label}`}
                  disabled={disabled || item.plannedQuantity <= 1}
                  onPress={() =>
                    onChange(
                      items.map((p, i) =>
                        i === index ? { ...p, plannedQuantity: p.plannedQuantity - 1 } : p,
                      ),
                    )
                  }
                  style={{
                    minHeight: 48,
                    minWidth: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    backgroundColor: colors.surfaceSoft,
                  }}
                >
                  <Text style={{ fontSize: 24, color: colors.text }}>−</Text>
                </Action>
                <Text
                  accessibilityLabel={`${item.plannedQuantity} planned`}
                  style={{ color: colors.text, fontSize: 18 }}
                >
                  {item.plannedQuantity} planned
                </Text>
                <Action
                  label={`Plan more ${item.label}`}
                  disabled={disabled || item.plannedQuantity >= 50}
                  onPress={() =>
                    onChange(
                      items.map((p, i) =>
                        i === index ? { ...p, plannedQuantity: p.plannedQuantity + 1 } : p,
                      ),
                    )
                  }
                  style={{
                    minHeight: 48,
                    minWidth: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    backgroundColor: colors.surfaceSoft,
                  }}
                >
                  <Text style={{ fontSize: 24, color: colors.text }}>+</Text>
                </Action>
              </View>
              <Choice
                label="Main drink"
                selected={item.isQuickLog}
                disabled={disabled}
                onPress={() => onChange(items.map((p, i) => ({ ...p, isQuickLog: i === index })))}
              />
              <Action
                label={`Remove ${item.label} from plan`}
                disabled={disabled}
                onPress={() => remove(index)}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.danger, fontSize: 15 }}>Remove from plan</Text>
              </Action>
            </Panel>
          ))}
        </>
      ) : null}
    </View>
  );
}
