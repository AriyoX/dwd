import { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bottleDrinkWord } from '@dwd/core';
import { type BottleDraft } from '@/lib/night-features';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';
import { Choice } from './choice';
import { DrinkQuantity } from './drink-quantity';
import { TextField } from './text-field';
import { Disclosure } from './disclosure';

export function SharedBottleFields({
  draft,
  onChange,
  disabled = false,
  error = false,
}: {
  draft: BottleDraft;
  onChange: (patch: Partial<BottleDraft>) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const { colors, typography } = useTheme();
  const [details, setDetails] = useState(false);
  const open = details || error;
  return (
    <View style={{ gap: 16 }}>
      <TextField
        label="Bottle name"
        value={draft.label}
        maxLength={60}
        editable={!disabled}
        onChangeText={(label) => onChange({ label })}
      />
      <Disclosure
        title="Drink type"
        detail={draft.category.charAt(0).toUpperCase() + draft.category.slice(1)}
        disabled={disabled}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['spirit', 'wine', 'beer', 'cocktail', 'other'] as const).map((category) => (
            <View key={category} style={{ flexGrow: 1, flexBasis: 140 }}>
              <Choice
                compact
                label={category.charAt(0).toUpperCase() + category.slice(1)}
                selected={draft.category === category}
                disabled={disabled}
                onPress={() => {
                  if (category === 'cocktail' || category === 'other') setDetails(true);
                  onChange({
                    category,
                    ...(category === 'wine'
                      ? { volumeMl: '750', abvPercent: '12', pourMl: '150' }
                      : category === 'spirit'
                        ? { volumeMl: '750', abvPercent: '40', pourMl: '30' }
                        : category === 'beer'
                          ? { volumeMl: '660', abvPercent: '5', pourMl: '330' }
                          : { abvPercent: '' }),
                  });
                }}
              />
            </View>
          ))}
        </View>
      </Disclosure>
      <DrinkQuantity
        label="Planned drinks"
        value={draft.defaultQuantity}
        disabled={disabled}
        onChange={(defaultQuantity) => onChange({ defaultQuantity })}
      />
      <Action
        label="Bottle size and serving"
        expanded={open}
        disabled={disabled}
        onPress={() => setDetails(!open)}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '600' }}>
            Size & strength
          </Text>
          <Text style={typography.body}>
            {draft.volumeMl || '—'} ml · {draft.abvPercent || '—'}% · {draft.pourMl || '—'} ml per{' '}
            {bottleDrinkWord(draft.category)}
          </Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.primary}
          accessible={false}
        />
      </Action>
      {open ? (
        <>
          <TextField
            label="Bottle size (ml)"
            keyboardType="decimal-pad"
            value={draft.volumeMl}
            editable={!disabled}
            maxLength={8}
            onChangeText={(volumeMl) => onChange({ volumeMl })}
          />
          <TextField
            label="Alcohol strength (%)"
            keyboardType="decimal-pad"
            value={draft.abvPercent}
            editable={!disabled}
            maxLength={8}
            onChangeText={(abvPercent) => onChange({ abvPercent })}
          />
          <TextField
            label="Serving (ml)"
            keyboardType="decimal-pad"
            value={draft.pourMl}
            editable={!disabled}
            maxLength={8}
            onChangeText={(pourMl) => onChange({ pourMl })}
          />
        </>
      ) : null}
      {open && draft.category === 'spirit' ? (
        <Text style={typography.body}>Enter just the spirit poured, without the mixer.</Text>
      ) : null}
    </View>
  );
}
