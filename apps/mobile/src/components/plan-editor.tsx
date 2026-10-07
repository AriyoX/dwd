import { Text, View } from 'react-native';
import { useState } from 'react';
import { DRINK_PRESETS, presetToPlanItem, type PlanItemInput } from '@dwd/core';
import { useTheme } from '@/providers/theme-provider';
import { Disclosure } from './disclosure';
import { Choice } from './choice';
import { Action, PrimaryButton } from './primary-button';
import { Notice, Panel } from './screen';
import { CustomDrinkForm } from './custom-drink-form';
import { DrinkQuantity } from './drink-quantity';

export function PlanEditor({
  items,
  onChange,
  mode,
  onModeChange,
  disabled = false,
  onEditingChange,
}: {
  items: PlanItemInput[];
  onChange: (items: PlanItemInput[]) => void;
  mode: 'unselected' | 'water_only' | 'drinks';
  onModeChange: (mode: 'water_only' | 'drinks') => void;
  disabled?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const controlsDisabled = disabled;
  function editItem(value: typeof editing) {
    setEditing(value);
    onEditingChange?.(value !== null);
  }
  function saveItem(index: number | 'new', item: PlanItemInput) {
    onChange(
      index === 'new'
        ? [...items, { ...item, isQuickLog: items.length === 0 }]
        : items.map((p, i) => (i === index ? { ...p, ...item } : p)),
    );
    editItem(null);
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
  if (editing !== null) {
    return (
      <CustomPlanItem
        key={editing}
        item={editing === 'new' ? undefined : items[editing]}
        disabled={disabled}
        onCancel={() => editItem(null)}
        onSave={(item) => saveItem(editing, item)}
      />
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
                  onPress={() => editItem(index)}
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
          ))}
          <Disclosure
            title={items.length ? 'Add another drink' : 'Choose drinks'}
            defaultExpanded={items.length === 0}
            disabled={controlsDisabled}
          >
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
            <PrimaryButton
              label="Add custom drink"
              icon="add-outline"
              variant="quiet"
              disabled={controlsDisabled || items.length >= 20}
              onPress={() => editItem('new')}
            />
          </Disclosure>
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
  const [quantity, setQuantity] = useState(item ? String(item.plannedQuantity) : '1');
  const [issue, setIssue] = useState<string | null>(null);
  return (
    <Panel>
      <CustomDrinkForm
        initial={item}
        disabled={disabled}
        onCancel={onCancel}
        onSave={(drink) => {
          const count = Number(quantity);
          if (!Number.isInteger(count) || count < 1 || count > 50) {
            setIssue('Choose 1 to 50 drinks.');
            return;
          }
          onSave({
            ...item,
            ...drink,
            plannedQuantity: count,
            isQuickLog: item?.isQuickLog ?? false,
          });
        }}
      >
        <DrinkQuantity
          label="Planned drinks"
          value={quantity}
          disabled={disabled}
          onChange={(value) => {
            setQuantity(value);
            setIssue(null);
          }}
        />
        {issue ? <Notice error message={issue} /> : null}
      </CustomDrinkForm>
    </Panel>
  );
}
