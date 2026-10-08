import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { View, type ScrollView, type ViewProps } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useFeatureTour } from '@/providers/feature-tour-provider';
import { FEATURE_TOUR_STEPS, type TourRoute, type TourTargetId } from '@/lib/feature-tour';
import { FeatureTour } from './feature-tour';
import { Screen } from './screen';

const TargetsContext = createContext<((id: TourTargetId, view: View | null) => void) | null>(null);

export function TourTarget({ id, ...props }: ViewProps & { id: TourTargetId }) {
  const register = useContext(TargetsContext);
  const ref = useCallback(
    (view: View | null) => {
      register?.(id, view);
    },
    [id, register],
  );
  return <View {...props} ref={ref} collapsable={false} />;
}

/** The coach and its controls share a native window and a non-scrolling parent. */
export function TourScreen({
  route,
  ...props
}: ComponentProps<typeof Screen> & { route: TourRoute }) {
  const tour = useFeatureTour();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const container = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const targets = useRef<Partial<Record<TourTargetId, View | null>>>({});
  const register = useCallback((id: TourTargetId, view: View | null) => {
    targets.current[id] = view;
  }, []);
  const index = tour?.index ?? null;
  const active = focused && index !== null && FEATURE_TOUR_STEPS[index]?.route === route;
  return (
    <TargetsContext.Provider value={register}>
      <View ref={container} collapsable={false} style={{ flex: 1 }}>
        <View
          style={{ flex: 1 }}
          pointerEvents={active ? 'none' : 'auto'}
          accessibilityElementsHidden={active}
          importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}
        >
          <Screen
            {...props}
            hidePermissionReminder={active || Boolean(props.hidePermissionReminder)}
            scrollRef={scroll}
            onScroll={(event) => {
              offset.current = event.nativeEvent.contentOffset.y;
              props.onScroll?.(event);
            }}
          />
        </View>
        {active && tour ? (
          <FeatureTour
            key={index}
            index={index}
            targets={targets}
            container={container}
            scroll={scroll}
            offset={offset}
            onGo={tour.go}
            onFinish={tour.finish}
          />
        ) : null}
      </View>
    </TargetsContext.Provider>
  );
}
