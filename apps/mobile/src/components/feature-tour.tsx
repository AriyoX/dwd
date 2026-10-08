import { useEffect, useState, type RefObject } from 'react';
import { Modal, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/providers/theme-provider';
import { PrimaryButton } from './primary-button';

export const FEATURE_TOUR_STEPS = [
  {
    id: 'start',
    title: 'Start a night',
    message: 'Choose your drinks, shared bottles and planned finish here.',
  },
  {
    id: 'join',
    title: 'Join your friends',
    message: 'Open an invite to join a night and keep your own plan.',
  },
  {
    id: 'active',
    title: 'Your night, in one place',
    message:
      'Open an active night to log drinks and chasers, review entries, share bottles and check on friends.',
  },
  {
    id: 'notifications',
    title: 'Stay in the loop',
    message:
      'Your reminders, check-ins and local campaign messages arrive here. Tap one to open its details.',
  },
  {
    id: 'entries',
    title: 'Look back',
    message: 'Find past entries, night recaps and photo memories here.',
  },
  {
    id: 'settings',
    title: 'Make it yours',
    message:
      'Change reminders, location, appearance or your profile here. You can replay this tour from Settings.',
  },
] as const;
export type TourTargetId = (typeof FEATURE_TOUR_STEPS)[number]['id'];
type Box = { x: number; y: number; width: number; height: number };

/** A read-only spotlight over measured controls. No sample drinks or practice tasks. */
export function FeatureTour({
  targets,
  scroll,
  offset,
  onFinish,
}: {
  targets: RefObject<Partial<Record<TourTargetId, View | null>>>;
  scroll: RefObject<ScrollView | null>;
  offset: RefObject<number>;
  onFinish: () => void;
}) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const current = FEATURE_TOUR_STEPS[step] ?? FEATURE_TOUR_STEPS[0];
  const [cardHeight, setCardHeight] = useState(240);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let aligned = false;
    const measure = () => {
      const target = targets.current[current.id];
      if (!target) {
        if (active && attempts++ < 10) timer = setTimeout(measure, 100);
        return;
      }
      target.measureInWindow((x, y, w, h) => {
        if (!active) return;
        if (!aligned) {
          aligned = true;
          scroll.current?.scrollTo({
            y: Math.max(0, offset.current + y - insets.top - 24),
            animated: false,
          });
          timer = setTimeout(measure, 100);
          return;
        }
        const top = Math.max(insets.top + 8, y - 5);
        setBox({
          x: Math.max(8, x - 5),
          y: top,
          width: Math.min(width - 16, w + 10),
          height: Math.max(44, Math.min(h + 10, height * 0.3, height - insets.bottom - top - 8)),
        });
      });
    };
    timer = setTimeout(measure, 100);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [current.id, targets, scroll, offset, width, height, fontScale, insets.top, insets.bottom]);
  const below =
    !box ||
    height - insets.bottom - box.y - box.height - 32 >= cardHeight ||
    height - insets.bottom - box.y - box.height > box.y - insets.top;
  const cardTop = !box
    ? insets.top + 32
    : below
      ? box.y + box.height + 16
      : Math.max(insets.top + 8, box.y - cardHeight - 16);
  const availableHeight =
    box && !below ? box.y - cardTop - 16 : height - insets.bottom - cardTop - 16;
  function go(next: number) {
    setBox(null);
    setStep(next);
  }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onFinish} statusBarTranslucent>
      <View style={{ flex: 1 }} accessibilityViewIsModal>
        {box ? (
          <>
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: box.y,
                backgroundColor: '#000000B3',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: box.y,
                width: box.x,
                height: box.height,
                backgroundColor: '#000000B3',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: box.x + box.width,
                right: 0,
                top: box.y,
                height: box.height,
                backgroundColor: '#000000B3',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: box.y + box.height,
                bottom: 0,
                backgroundColor: '#000000B3',
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                borderWidth: 2,
                borderColor: colors.primary,
                borderRadius: 18,
              }}
            />
          </>
        ) : (
          <View style={{ position: 'absolute', inset: 0, backgroundColor: '#000000B3' }} />
        )}
        <ScrollView
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: cardTop,
            maxHeight: Math.max(100, availableHeight),
            backgroundColor: colors.surface,
            borderRadius: 24,
          }}
          contentContainerStyle={{ padding: 20, gap: 14 }}
          onContentSizeChange={(_w, h) => setCardHeight(h)}
        >
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {step + 1} of {FEATURE_TOUR_STEPS.length}
          </Text>
          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={typography.sectionTitle}
          >
            {current.title}
          </Text>
          <Text style={{ ...typography.body, color: colors.text }}>{current.message}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {step > 0 ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Back" variant="secondary" onPress={() => go(step - 1)} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={step === FEATURE_TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
                onPress={() => (step === FEATURE_TOUR_STEPS.length - 1 ? onFinish() : go(step + 1))}
              />
            </View>
          </View>
          <PrimaryButton label="Skip tour" variant="quiet" onPress={onFinish} />
        </ScrollView>
      </View>
    </Modal>
  );
}
