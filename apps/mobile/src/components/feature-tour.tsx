import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { BackHandler, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/providers/theme-provider';
import {
  FEATURE_TOUR_STEPS,
  relativeTourBox,
  sameTourBox,
  tourCardLayout,
  tourScrollOffset,
  tourSpotlight,
  type TourBox,
  type TourTargetId,
} from '@/lib/feature-tour';
import { PrimaryButton } from './primary-button';

export function FeatureTour({
  index,
  targets,
  container,
  scroll,
  offset,
  onGo,
  onFinish,
}: {
  index: number;
  targets: RefObject<Partial<Record<TourTargetId, View | null>>>;
  container: RefObject<View | null>;
  scroll: RefObject<ScrollView | null>;
  offset: RefObject<number>;
  onGo: (index: number) => void;
  onFinish: () => void;
}) {
  const { colors, typography } = useTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const [box, setBox] = useState<TourBox | null>(null);
  const [viewport, setViewport] = useState<TourBox | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [cardHeight, setCardHeight] = useState(260);
  const current = FEATURE_TOUR_STEPS[index] ?? FEATURE_TOUR_STEPS[0];

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) onGo(index - 1);
      else onFinish();
      return true;
    });
    return () => listener.remove();
  }, [index, onGo, onFinish]);

  useLayoutEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let previous: TourBox | null = null;
    let previousViewport: TourBox | null = null;
    let requestedOffset: number | null = null;
    const started = Date.now();
    const retry = () => {
      if (active) timer = setTimeout(measure, 100);
    };
    const missing = () => {
      previous = null;
      setBox(null);
      setUnavailable(Date.now() - started >= 2500);
      retry();
    };
    const measure = () => {
      const root = container.current;
      const scroller = scroll.current;
      const nativeScroll = scroller?.getNativeScrollRef();
      if (!root || !scroller || !nativeScroll) {
        missing();
        return;
      }
      root.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
        if (!active) return;
        const origin = { x: rootX, y: rootY, width: rootWidth, height: rootHeight };
        nativeScroll.measureInWindow((scrollX, scrollY, scrollWidth, scrollHeight) => {
          if (!active) return;
          const frame = relativeTourBox(
            { x: scrollX, y: scrollY, width: scrollWidth, height: scrollHeight },
            origin,
          );
          // This viewport excludes native headers, tab bars and safe areas.
          const visible = {
            x: Math.max(0, frame.x),
            y: Math.max(0, frame.y),
            width: Math.min(rootWidth, frame.x + frame.width) - Math.max(0, frame.x),
            height: Math.min(rootHeight, frame.y + frame.height) - Math.max(0, frame.y),
          };
          if (visible.width <= 0 || visible.height <= 0) {
            missing();
            return;
          }
          setViewport((old) => (sameTourBox(old, visible) ? old : visible));
          const target = targets.current[current.id];
          if (!target) {
            missing();
            return;
          }
          target.measureInWindow((x, y, w, h) => {
            if (!active) return;
            if (targets.current[current.id] !== target || w <= 0 || h <= 0) {
              missing();
              return;
            }
            const measured = relativeTourBox({ x, y, width: w, height: h }, origin);
            const nextOffset = tourScrollOffset(measured, visible, offset.current);
            if (
              nextOffset !== null &&
              (requestedOffset === null || Math.abs(nextOffset - requestedOffset) > 1)
            ) {
              requestedOffset = nextOffset;
              previous = null;
              setBox(null);
              scroller.scrollTo({ y: nextOffset, animated: false });
              retry();
              return;
            }
            // Wait for data/layout and native navigation to settle; continue
            // tracking while open so subsequent layout changes stay aligned.
            const settled =
              sameTourBox(previous, measured) && sameTourBox(previousViewport, visible);
            previous = measured;
            previousViewport = visible;
            const spotlight = settled ? tourSpotlight(measured, visible) : null;
            setBox((old) => (spotlight && sameTourBox(old, spotlight) ? old : spotlight));
            setUnavailable(!spotlight && Date.now() - started >= 2500);
            retry();
          });
        });
      });
    };
    measure();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [current.id, targets, container, scroll, offset, width, height, fontScale]);

  const placement = viewport ? tourCardLayout(box, viewport, cardHeight) : null;
  // At extreme text sizes or in landscape, keep every tour control reachable
  // even when the target and card cannot fit beside each other.
  const spotlight = placement && placement.maxHeight < 144 ? null : box;
  const card = viewport && !spotlight ? tourCardLayout(null, viewport, cardHeight) : placement;
  const shade = '#000000B3';
  return (
    <View
      testID="feature-tour"
      style={{ position: 'absolute', inset: 0 }}
      accessibilityViewIsModal
      onAccessibilityEscape={onFinish}
    >
      {spotlight ? (
        <>
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: spotlight.y,
              backgroundColor: shade,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: spotlight.y,
              width: spotlight.x,
              height: spotlight.height,
              backgroundColor: shade,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: spotlight.x + spotlight.width,
              right: 0,
              top: spotlight.y,
              height: spotlight.height,
              backgroundColor: shade,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: spotlight.y + spotlight.height,
              bottom: 0,
              backgroundColor: shade,
            }}
          />
          <View
            testID="tour-spotlight"
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: spotlight.x,
              top: spotlight.y,
              width: spotlight.width,
              height: spotlight.height,
              borderWidth: 2,
              borderColor: colors.primary,
              borderRadius: 18,
            }}
          />
        </>
      ) : (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: shade }} />
      )}
      <ScrollView
        testID="tour-card"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: card?.top ?? 16,
          maxHeight: card?.maxHeight ?? height - 32,
          backgroundColor: colors.surface,
          borderRadius: 24,
        }}
        contentContainerStyle={{ padding: 20, gap: 14 }}
        onContentSizeChange={(_w, h) => setCardHeight(h)}
      >
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {index + 1} of {FEATURE_TOUR_STEPS.length}
        </Text>
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={typography.sectionTitle}
        >
          {current.title}
        </Text>
        <Text style={{ ...typography.body, color: colors.text }}>
          {box
            ? current.message
            : unavailable
              ? "This item isn't available right now. Continue to the next step or skip the tour."
              : 'Opening this step…'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {index > 0 ? (
            <View style={{ flex: 1 }}>
              <PrimaryButton label="Back" variant="secondary" onPress={() => onGo(index - 1)} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={index === FEATURE_TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
              disabled={!box && !unavailable}
              onPress={() =>
                index === FEATURE_TOUR_STEPS.length - 1 ? onFinish() : onGo(index + 1)
              }
            />
          </View>
        </View>
        <PrimaryButton label="Skip tour" variant="quiet" onPress={onFinish} />
      </ScrollView>
    </View>
  );
}
