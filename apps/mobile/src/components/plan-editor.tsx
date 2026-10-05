import { Text, View } from 'react-native';
import { useState } from 'react';
import {
  DRINK_PRESETS,
  presetToPlanItem,
  planItemInputSchema,
  type PlanItemInput,
  type DrinkCategory,
} from '@dwd/core';
import { useTheme } from '@/providers/theme-provider';
import { Choice } from './choice';
import { Action, PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';
import { TextField } from './text-field';

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
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const controlsDisabled = disabled || editing !== null;
  function saveItem(index: number | 'new', item: PlanItemInput) {
    onChange(
      index === 'new'
        ? [...items, { ...item, isQuickLog: items.length === 0 }]
        : items.map((p, i) => (i === index ? { ...p, ...item } : p)),
    );
    setEditing(null);
  }
  function togglePreset(id: string) {
    const preset = DRINK_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const existing = items.find(
      (item) =>
        !item.sharedBottleId &&
        item.label === preset.label &&
        item.category === preset.category &&
        item.volumeMl === preset.volumeMl &&
        item.abvPercent === preset.abvPercent,
    );
    if (!existing && items.length >= 20) return;
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
        disabled={controlsDisabled}
        onPress={() => onModeChange('water_only')}
      />
      <Choice
        label="Plan drinks"
        selected={mode === 'drinks'}
        disabled={controlsDisabled}
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
                  item.category === preset.category &&
                  item.volumeMl === preset.volumeMl &&
                  item.abvPercent === preset.abvPercent,
              )}
              disabled={controlsDisabled}
              onPress={() => togglePreset(preset.id)}
            />
          ))}
          {items.map((item, index) =>
            editing === index ? (
              <CustomPlanItem
                key={item.id ?? `${item.label}:${index}`}
                item={item}
                disabled={disabled}
                onCancel={() => setEditing(null)}
                onSave={(saved) => saveItem(index, saved)}
              />
            ) : (
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
                    disabled={controlsDisabled || item.plannedQuantity <= 1}
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
                    style={{ color: colors.text, fontSize: 18, flex: 1, textAlign: 'center' }}
                  >
                    {item.plannedQuantity} planned
                  </Text>
                  <Action
                    label={`Plan more ${item.label}`}
                    disabled={controlsDisabled || item.plannedQuantity >= 50}
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
                  disabled={controlsDisabled}
                  onPress={() => onChange(items.map((p, i) => ({ ...p, isQuickLog: i === index })))}
                />
                {!item.sharedBottleId ? (
                  <PrimaryButton
                    label={`Edit ${item.label}`}
                    variant="quiet"
                    disabled={controlsDisabled}
                    onPress={() => setEditing(index)}
                  />
                ) : null}
                <Action
                  label={`Remove ${item.label} from plan`}
                  disabled={controlsDisabled}
                  onPress={() => remove(index)}
                  style={{ minHeight: 48, justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.danger, fontSize: 15 }}>Remove from plan</Text>
                </Action>
              </Panel>
            ),
          )}
          {editing === 'new' ? (
            <CustomPlanItem
              key={editing}
              item={undefined}
              disabled={disabled}
              onCancel={() => setEditing(null)}
              onSave={(item) => saveItem('new', item)}
            />
          ) : (
            <PrimaryButton
              label="Add custom drink"
              icon="add-outline"
              variant="secondary"
              disabled={controlsDisabled || items.length >= 20}
              onPress={() => setEditing('new')}
            />
          )}
        </>
      ) : null}
    </View>
  );
}

function CustomPlanItem({
  item,
  disabled,
  onSave,
  onCancel,
}: {
  item: PlanItemInput | undefined;
  disabled: boolean;
  onSave: (item: PlanItemInput) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(item?.label ?? '');
  const [category, setCategory] = useState<DrinkCategory>(item?.category ?? 'other');
  const [volume, setVolume] = useState(item ? String(item.volumeMl) : '');
  const [abv, setAbv] = useState(item ? String(item.abvPercent) : '');
  const [quantity, setQuantity] = useState(item ? String(item.plannedQuantity) : '1');
  const [issue, setIssue] = useState<string | null>(null);
  return (
    <Panel>
      <TextField
        label="Drink name"
        value={label}
        onChangeText={setLabel}
        maxLength={60}
        editable={!disabled}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['beer', 'wine', 'spirit', 'cocktail', 'other'] as const).map((value) => (
          <Choice
            key={value}
            compact
            label={value.charAt(0).toUpperCase() + value.slice(1)}
            selected={category === value}
            disabled={disabled}
            onPress={() => setCategory(value)}
          />
        ))}
      </View>
      <TextField
        label="Serving (ml)"
        value={volume}
        onChangeText={setVolume}
        keyboardType="decimal-pad"
        editable={!disabled}
      />
      <TextField
        label="ABV (%)"
        value={abv}
        onChangeText={setAbv}
        keyboardType="decimal-pad"
        editable={!disabled}
      />
      <TextField
        label="Planned quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
        editable={!disabled}
      />
      {issue ? <Notice error message={issue} /> : null}
      <PrimaryButton
        label="Save drink"
        disabled={disabled}
        onPress={() => {
          if (!abv.trim()) {
            setIssue('Enter ABV, including 0 for an alcohol-free drink.');
            return;
          }
          const parsed = planItemInputSchema.safeParse({
            ...item,
            label,
            category,
            volumeMl: Number(volume.replace(',', '.')),
            abvPercent: Number(abv.replace(',', '.')),
            plannedQuantity: Number(quantity),
            isQuickLog: item?.isQuickLog ?? false,
          });
          if (!parsed.success)
            setIssue(parsed.error.issues[0]?.message ?? 'Check the drink details.');
          else onSave(parsed.data);
        }}
      />
      <PrimaryButton label="Cancel edit" variant="quiet" disabled={disabled} onPress={onCancel} />
    </Panel>
  );
}
