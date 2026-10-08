import { useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, Text, View, type ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { recentDrinks, drinkKey } from '@/lib/recent-drinks';
import { DRINK_PRESETS } from '@dwd/core';
import { CustomDrinkForm } from '@/components/custom-drink-form';
import { DrinkLogButton } from '@/components/drink-log-button';
import { PrimaryButton } from '@/components/primary-button';
import { LoadingPanel, Notice, RetryPanel, Screen } from '@/components/screen';
import { useNight } from '@/hooks/use-night';
import { useLogging } from '@/hooks/use-logging';
import { nightAccess } from '@/lib/night-features';
import { useTheme } from '@/providers/theme-provider';

export default function LogScreen() {
  const { nightId, memberId } = useLocalSearchParams<{ nightId: string; memberId?: string }>();
  const router = useRouter();
  const { typography } = useTheme();
  const { snapshot, issue, refresh } = useNight(nightId);
  const logging = useLogging(() => router.back(), snapshot);
  const [custom, setCustom] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const access = snapshot ? nightAccess(snapshot, memberId ?? snapshot.currentMemberId) : null;
  const target = access?.member;
  const recent = target ? recentDrinks(target) : [];
  const planned = target?.planItems.filter((item) => !item.archivedAt) ?? [];
  const shown = new Set(
    [...planned.filter((item) => !item.sharedBottleId), ...recent].map(drinkKey),
  );
  const presets = DRINK_PRESETS.filter((preset) => !shown.has(drinkKey(preset)));
  useLayoutEffect(() => {
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [custom]);
  return (
    <Screen
      insetTop={false}
      sheetTitle={custom ? 'Custom drink' : 'Log drink'}
      scrollRef={scroll}
      footer={
        !custom && access?.canLog ? (
          <PrimaryButton
            label="Custom drink"
            icon="add-outline"
            variant="quiet"
            disabled={logging.busy}
            onPress={() => setCustom(true)}
          />
        ) : undefined
      }
    >
      {issue && !snapshot ? (
        <RetryPanel issue={issue} retry={() => void refresh()} />
      ) : !snapshot ? (
        <LoadingPanel />
      ) : !access?.canLog || !target ? (
        <Notice message="This night has ended or you can't log for this person." />
      ) : (
        <>
          {target.id !== snapshot.currentMemberId ? (
            <Text style={typography.sectionTitle}>For {target.displayName}</Text>
          ) : null}
          {logging.issue ? <Notice dismissible error message={logging.issue} /> : null}
          {custom ? (
            <CustomDrinkForm
              key={target.id}
              busy={logging.busy}
              saveLabel="Log drink"
              onCancel={() => setCustom(false)}
              onSave={async (drink) => {
                await logging.log(target.id, { customDrink: drink });
              }}
            />
          ) : (
            <>
              {target.planItems.some((p) => !p.archivedAt) ? (
                <View style={{ gap: 12 }}>
                  <Text accessibilityRole="header" style={typography.sectionTitle}>
                    Your plan
                  </Text>
                  {target.planItems
                    .filter((p) => !p.archivedAt)
                    .map((item) => (
                      <DrinkLogButton
                        key={item.id}
                        label={item.label}
                        detail={`${item.volumeMl} ml · ${item.abvPercent}%${item.sharedBottleId ? ' · shared bottle' : ''}`}
                        busy={logging.busy}
                        onPress={() => void logging.log(target.id, { planItemId: item.id })}
                      />
                    ))}
                </View>
              ) : null}
              {recent.length ? (
                <View style={{ gap: 12 }}>
                  <Text accessibilityRole="header" style={typography.sectionTitle}>
                    Recent drinks
                  </Text>
                  {recent.map((drink) => (
                    <DrinkLogButton
                      key={drinkKey(drink)}
                      label={drink.label}
                      detail={`${drink.volumeMl} ml · ${drink.abvPercent}%`}
                      busy={logging.busy}
                      onPress={() => void logging.log(target.id, { customDrink: drink })}
                    />
                  ))}
                </View>
              ) : null}
              <View style={{ gap: 12 }}>
                <Text accessibilityRole="header" style={typography.sectionTitle}>
                  Choose a drink
                </Text>
                {presets.map((preset) => (
                  <DrinkLogButton
                    key={preset.id}
                    label={preset.label}
                    detail={`${preset.volumeMl} ml · ${preset.abvPercent}%${preset.estimate ? ' · estimate' : ''}`}
                    busy={logging.busy}
                    onPress={() => void logging.log(target.id, { customDrink: preset })}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
