import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  canUserLogForMember,
  customDrinkSchema,
  DRINK_PRESETS,
  type DrinkCategory,
} from '@dwd/core';
import { Choice } from '@/components/choice';
import { PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, Panel, RetryPanel, Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { useNight } from '@/hooks/use-night';
import { useLogging } from '@/hooks/use-logging';
import { useTheme } from '@/providers/theme-provider';

export default function LogScreen() {
  const { nightId, memberId } = useLocalSearchParams<{ nightId: string; memberId?: string }>();
  const router = useRouter();
  const { typography } = useTheme();
  const { snapshot, issue: loadIssue, refresh } = useNight(nightId);
  const logging = useLogging(() => router.back());
  const [choice, setChoice] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<DrinkCategory>('other');
  const [volume, setVolume] = useState('');
  const [abv, setAbv] = useState('');
  const [issue, setIssue] = useState<string | null>(null);
  const actor = snapshot?.members.find((m) => m.id === snapshot.currentMemberId) ?? null;
  const target = snapshot?.members.find((m) => m.id === (memberId ?? snapshot.currentMemberId));
  const allowed =
    snapshot &&
    target &&
    canUserLogForMember({
      actorUserId: snapshot.currentUserId,
      actorMembership: actor,
      targetMember: target,
      night: snapshot.night,
    });
  async function save() {
    if (!target || !allowed || !choice) return;
    setIssue(null);
    if (choice.startsWith('plan:')) {
      await logging.log(target.id, { planItemId: choice.slice(5) });
      return;
    }
    const preset = DRINK_PRESETS.find((p) => p.id === choice);
    const parsed = customDrinkSchema.safeParse(
      preset ?? {
        label,
        category,
        volumeMl: Number(volume.replace(',', '.')),
        abvPercent: Number(abv.replace(',', '.')),
      },
    );
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Check this drink.');
      return;
    }
    await logging.log(target.id, { customDrink: parsed.data });
  }
  return (
    <Screen insetTop={false}>
      {loadIssue && !snapshot ? (
        <RetryPanel issue={loadIssue} retry={() => void refresh()} />
      ) : !snapshot ? (
        <LoadingPanel />
      ) : !allowed ? (
        <Notice message="You cannot log for this member or the night has ended." />
      ) : (
        <>
          <Text accessibilityRole="header" style={typography.sectionTitle}>
            {target.displayName}
          </Text>
          {target.planItems.filter((p) => !p.archivedAt).length ? (
            <View style={{ gap: 10 }}>
              <Text accessibilityRole="header" style={typography.sectionTitle}>
                From the plan
              </Text>
              {target.planItems
                .filter((p) => !p.archivedAt)
                .map((item) => (
                  <Choice
                    key={item.id}
                    label={item.label}
                    detail={`${item.volumeMl} ml · ${item.abvPercent}% ABV`}
                    disabled={logging.busy}
                    selected={choice === `plan:${item.id}`}
                    onPress={() => setChoice(`plan:${item.id}`)}
                  />
                ))}
            </View>
          ) : null}
          <Text accessibilityRole="header" style={typography.sectionTitle}>
            Another drink
          </Text>
          {DRINK_PRESETS.map((preset) => (
            <Choice
              key={preset.id}
              label={preset.label}
              detail={`${preset.volumeMl} ml · ${preset.abvPercent}% ABV${preset.estimate ? ' · estimate' : ''}`}
              selected={choice === preset.id}
              disabled={logging.busy}
              onPress={() => setChoice(preset.id)}
            />
          ))}
          <Choice
            label="Custom drink"
            selected={choice === 'custom'}
            disabled={logging.busy}
            onPress={() => setChoice('custom')}
          />
          {choice === 'custom' ? (
            <Panel>
              <TextField label="Drink name" value={label} maxLength={60} onChangeText={setLabel} />
              <View style={{ gap: 8 }}>
                {(['beer', 'wine', 'spirit', 'cocktail', 'other'] as const).map((value) => (
                  <Choice
                    key={value}
                    label={value.charAt(0).toUpperCase() + value.slice(1)}
                    selected={category === value}
                    disabled={logging.busy}
                    onPress={() => setCategory(value)}
                  />
                ))}
              </View>
              <TextField
                label="Volume (ml)"
                keyboardType="decimal-pad"
                value={volume}
                onChangeText={setVolume}
              />
              <TextField
                label="ABV (%)"
                keyboardType="decimal-pad"
                value={abv}
                onChangeText={setAbv}
              />
            </Panel>
          ) : null}
          {issue || logging.issue ? <Notice error message={issue ?? logging.issue ?? ''} /> : null}
          <PrimaryButton
            label="Log drink"
            busy={logging.busy}
            disabled={!choice}
            onPress={() => void save()}
          />
        </>
      )}
    </Screen>
  );
}
