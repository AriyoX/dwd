import { useRef, useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import type { CustomDrinkInput } from '@dwd/core';
import {
  customServing,
  parseCustomDrink,
  type CustomDrinkDraft,
  type DrinkFieldErrors,
} from '@/lib/custom-drink';
import { useTheme } from '@/providers/theme-provider';
import { TextField } from './text-field';
import { PrimaryButton } from './primary-button';
import { Disclosure } from './disclosure';
import { Choice } from './choice';

export function CustomDrinkForm({
  initial,
  disabled = false,
  busy = false,
  onSave,
  onCancel,
  saveLabel = 'Save drink',
  children,
}: {
  initial?: CustomDrinkInput | undefined;
  disabled?: boolean;
  busy?: boolean;
  onSave: (drink: CustomDrinkInput) => void | Promise<void>;
  onCancel: () => void;
  saveLabel?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<CustomDrinkDraft>(() => ({
    label: initial?.label ?? '',
    category: initial?.category ?? 'other',
    volume: initial ? String(initial.volumeMl) : '330',
    abv: initial ? String(initial.abvPercent) : '',
  }));
  const [errors, setErrors] = useState<DrinkFieldErrors>({});
  const saving = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const volumeEdited = useRef(Boolean(initial));
  const blocked = disabled || busy || submitting;
  function change(patch: Partial<CustomDrinkDraft>) {
    setDraft((old) => ({ ...old, ...patch }));
    setErrors({});
  }
  async function save() {
    if (blocked || saving.current) return;
    const result = parseCustomDrink(draft);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    saving.current = true;
    setSubmitting(true);
    Keyboard.dismiss();
    try {
      await onSave(result.data);
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <TextField
        label="Drink name"
        value={draft.label}
        maxLength={60}
        editable={!blocked}
        onChangeText={(label) => change({ label })}
        error={errors.label}
        returnKeyType="done"
      />
      <TextField
        label="Serving (ml)"
        value={draft.volume}
        onChangeText={(volume) => {
          volumeEdited.current = true;
          change({ volume });
        }}
        keyboardType="decimal-pad"
        maxLength={8}
        editable={!blocked}
        error={errors.volume}
      />
      <TextField
        label="Alcohol strength (%)"
        value={draft.abv}
        onChangeText={(abv) => change({ abv })}
        keyboardType="decimal-pad"
        maxLength={8}
        editable={!blocked}
        error={errors.abv}
      />
      {errors.abv ? (
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          Use Log chaser for an alcohol-free drink.
        </Text>
      ) : null}
      <Disclosure
        title="Drink type"
        detail={draft.category.charAt(0).toUpperCase() + draft.category.slice(1)}
        disabled={blocked}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['beer', 'wine', 'spirit', 'cocktail', 'other'] as const).map((category) => (
            <View key={category} style={{ flexGrow: 1, flexBasis: '30%', minWidth: 90 }}>
              <Choice
                compact
                label={category.charAt(0).toUpperCase() + category.slice(1)}
                selected={draft.category === category}
                disabled={blocked}
                onPress={() =>
                  change({
                    category,
                    ...(!volumeEdited.current ? { volume: customServing[category] } : {}),
                  })
                }
              />
            </View>
          ))}
        </View>
      </Disclosure>
      {children}
      <PrimaryButton
        large
        label={saveLabel}
        busy={busy || submitting}
        disabled={disabled}
        onPress={() => void save()}
      />
      <PrimaryButton
        label="Cancel"
        variant="quiet"
        disabled={blocked}
        onPress={() => {
          Keyboard.dismiss();
          onCancel();
        }}
      />
    </View>
  );
}
