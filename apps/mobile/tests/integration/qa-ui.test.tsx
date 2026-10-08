/* eslint-disable @typescript-eslint/no-deprecated -- Verify native interactions without a device. */
import { createElement, useRef, useState } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanItemInput } from '@dwd/core';
import { CustomDrinkForm } from '@/components/custom-drink-form';
import { DismissibleNotice } from '@/components/dismissible-notice';
import { DrinkLogButton } from '@/components/drink-log-button';
import { PlanEditor } from '@/components/plan-editor';
import { Notice, Screen } from '@/components/screen';
import { SharedBottleFields } from '@/components/shared-bottle-fields';
import { newBottleDraft } from '@/lib/night-features';

type PanEvent = { translationX: number; velocityX: number };
const runtime = vi.hoisted(() => ({
  platform: 'ios',
  reduced: false,
  dismiss: vi.fn(),
  save: vi.fn(),
  cancel: vi.fn(),
  editing: vi.fn(),
  log: vi.fn(),
  pan: null as null | {
    start?: () => void;
    update?: (event: PanEvent) => void;
    end?: (event: PanEvent) => void;
    finalize?: (event: PanEvent, success: boolean) => void;
    active?: number[];
    fail?: number[];
  },
  timing: vi.fn(),
  spring: vi.fn(),
  offset: null as null | { get: () => number; set: (value: number) => void },
  animatedStyle: null as null | (() => { transform: { translateX: number }[] }),
}));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  TextInput: 'TextInput',
  InputAccessoryView: 'InputAccessoryView',
  Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator',
  ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Keyboard: { dismiss: runtime.dismiss },
  Platform: {
    get OS() {
      return runtime.platform;
    },
  },
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/providers/theme-provider', async () => {
  const { lightColors, makeTypography } = await import('@/theme/tokens');
  return {
    useTheme: () => ({
      colors: lightColors,
      typography: makeTypography(lightColors),
      scheme: 'light',
    }),
    useThemedStyles: <T,>(factory: (colors: typeof lightColors) => T) => factory(lightColors),
  };
});
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  cubicBezier: vi.fn(),
  cancelAnimation: vi.fn(),
  useReducedMotion: () => runtime.reduced,
  useAnimatedStyle: (fn: NonNullable<typeof runtime.animatedStyle>) => {
    runtime.animatedStyle = fn;
    return fn();
  },
  useSharedValue: (initial: number) => {
    const ref = useRef(initial);
    const value = {
      get: () => ref.current,
      set: (next: number) => {
        ref.current = next;
      },
    };
    runtime.offset = value;
    return value;
  },
  withTiming: (
    value: number,
    config: { duration: number },
    complete?: (finished: boolean) => void,
  ) => {
    runtime.timing(value, config);
    complete?.(true);
    return value;
  },
  withSpring: (value: number, config: unknown, complete?: (finished: boolean) => void) => {
    runtime.spring(value, config);
    complete?.(true);
    return value;
  },
}));
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: 'GestureDetector',
  Gesture: {
    Pan: () => {
      const pan: NonNullable<typeof runtime.pan> = {};
      runtime.pan = pan;
      const builder = {
        activeOffsetX: (value: number[]) => {
          pan.active = value;
          return builder;
        },
        failOffsetY: (value: number[]) => {
          pan.fail = value;
          return builder;
        },
        onStart: (fn: () => void) => {
          pan.start = fn;
          return builder;
        },
        onUpdate: (fn: (event: PanEvent) => void) => {
          pan.update = fn;
          return builder;
        },
        onEnd: (fn: (event: PanEvent) => void) => {
          pan.end = fn;
          return builder;
        },
        onFinalize: (fn: (event: PanEvent, success: boolean) => void) => {
          pan.finalize = fn;
          return builder;
        },
      };
      return builder;
    },
  },
}));

let root: ReactTestRenderer | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  runtime.platform = 'ios';
  runtime.reduced = false;
  runtime.pan = null;
  runtime.offset = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});
async function mount(element: React.ReactElement) {
  await act(() => {
    root = create(element);
  });
}
function native(type: string): ReactTestInstance[] {
  return root?.root.findAll((entry) => entry.type === (type as unknown)) ?? [];
}
async function press(label: string) {
  const button = native('Pressable').find((entry) => {
    if (entry.props['accessibilityLabel'] !== label) return false;
    for (let ancestor = entry.parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor.props['accessibilityElementsHidden'] === true) return false;
    }
    return true;
  });
  if (!button) throw new Error(`Missing button ${label}`);
  await act(() => {
    (button.props['onPress'] as () => void)();
  });
}
async function input(label: string, value: string) {
  const field = native('TextInput').find((entry) => entry.props['accessibilityLabel'] === label);
  if (!field) throw new Error(`Missing input ${label}`);
  await act(() => {
    (field.props['onChangeText'] as (text: string) => void)(value);
  });
}
function text() {
  return JSON.stringify(root?.toJSON());
}

describe('custom drink editor', () => {
  it('keeps bottle details compact and opens strength fields for a custom mixture', async () => {
    function Bottle() {
      const [draft, setDraft] = useState(() => newBottleDraft('bottle'));
      return (
        <SharedBottleFields
          draft={draft}
          onChange={(patch) => setDraft((value) => ({ ...value, ...patch }))}
        />
      );
    }
    await mount(<Bottle />);
    expect(
      native('TextInput').some(
        (field) => field.props['accessibilityLabel'] === 'Alcohol strength (%)',
      ),
    ).toBe(false);
    await press('Drink type. Spirit');
    await press('Cocktail');
    expect(
      native('TextInput').find(
        (field) => field.props['accessibilityLabel'] === 'Alcohol strength (%)',
      )?.props['value'],
    ).toBe('');
    await input('Alcohol strength (%)', '15');
    expect(
      native('TextInput').find(
        (field) => field.props['accessibilityLabel'] === 'Alcohol strength (%)',
      )?.props['value'],
    ).toBe('15');
  });
  it('validates inline, saves once with decimal input, and dismisses the keyboard', async () => {
    await mount(createElement(CustomDrinkForm, { onSave: runtime.save, onCancel: runtime.cancel }));
    await press('Save drink');
    expect(runtime.save).not.toHaveBeenCalled();
    expect(text()).toContain('Give your drink a name');
    expect(text()).toContain('Use an alcohol strength');
    await input('Drink name', ' My gin ');
    await press('Drink type. Other');
    await press('Spirit');
    await input('Alcohol strength (%)', '37,5');
    expect(
      native('TextInput').find((field) => field.props['accessibilityLabel'] === 'Serving (ml)')
        ?.props['value'],
    ).toBe('30');
    await press('Save drink');
    expect(runtime.save).toHaveBeenCalledExactlyOnceWith({
      label: 'My gin',
      category: 'spirit',
      volumeMl: 30,
      abvPercent: 37.5,
    });
    expect(runtime.dismiss).toHaveBeenCalledOnce();
  });
  it('keeps an intentional serving size when the category changes', async () => {
    await mount(createElement(CustomDrinkForm, { onSave: runtime.save, onCancel: runtime.cancel }));
    await input('Serving (ml)', '45');
    await press('Drink type. Other');
    await press('Spirit');
    expect(
      native('TextInput').find((field) => field.props['accessibilityLabel'] === 'Serving (ml)')
        ?.props['value'],
    ).toBe('45');
    await press('Cancel');
    expect(runtime.cancel).toHaveBeenCalledOnce();
    expect(runtime.save).not.toHaveBeenCalled();
    expect(runtime.dismiss).toHaveBeenCalledOnce();
  });
  it('provides Done controls on iOS numeric keyboards and uses Android resize scrolling', async () => {
    await mount(
      <Screen insetTop={false}>
        <CustomDrinkForm onSave={runtime.save} onCancel={runtime.cancel} />
      </Screen>,
    );
    expect(native('InputAccessoryView')).toHaveLength(2);
    expect(
      native('TextInput')
        .filter((field) => field.props['keyboardType'] === 'decimal-pad')
        .every((field) => field.props['inputAccessoryViewID']),
    ).toBe(true);
    expect(native('SafeAreaView')[0]?.props['edges']).toContain('bottom');
    expect(native('ScrollView')[0]?.props['keyboardShouldPersistTaps']).toBe('handled');
    expect(native('ScrollView')[0]?.props['automaticallyAdjustKeyboardInsets']).toBe(true);
    runtime.platform = 'android';
    await act(() =>
      root?.update(
        <Screen insetTop={false}>
          <CustomDrinkForm onSave={runtime.save} onCancel={runtime.cancel} />
        </Screen>,
      ),
    );
    expect(native('InputAccessoryView')).toHaveLength(0);
    expect(native('ScrollView')[0]?.props['keyboardDismissMode']).toBe('on-drag');
  });
  it('blocks save and cancel while logging', async () => {
    await mount(
      createElement(CustomDrinkForm, {
        busy: true,
        onSave: runtime.save,
        onCancel: runtime.cancel,
      }),
    );
    expect(native('TextInput').every((field) => field.props['editable'] === false)).toBe(true);
    expect(
      native('Pressable')
        .filter((button) => button.props['accessibilityLabel'] !== 'Done typing')
        .every((button) => button.props['disabled'] === true),
    ).toBe(true);
  });
  it('keeps plan editing focused and reports its open state to the surrounding form', async () => {
    function Editor() {
      const [items, setItems] = useState<PlanItemInput[]>([]);
      return createElement(PlanEditor, {
        mode: 'drinks',
        items,
        onChange: setItems,
        onModeChange: vi.fn(),
        onEditingChange: runtime.editing,
      });
    }
    await mount(createElement(Editor));
    await press('Add custom drink');
    expect(runtime.editing).toHaveBeenLastCalledWith(true);
    expect(text()).not.toContain('Choose drinks');
    await input('Drink name', 'House wine');
    await input('Alcohol strength (%)', '12');
    await press('Save drink');
    expect(runtime.editing).toHaveBeenLastCalledWith(false);
    expect(text()).toContain('House wine');
    await press('Edit House wine');
    await press('Cancel');
    expect(runtime.editing).toHaveBeenLastCalledWith(false);
    expect(text()).toContain('Add another drink');
  });
});

describe('temporary messages', () => {
  it('does not restart the eight-second timer when the screen updates', async () => {
    vi.useFakeTimers();
    try {
      await mount(
        <Screen>
          <Notice dismissible message="Drink logged." />
        </Screen>,
      );
      await act(() => {
        vi.advanceTimersByTime(6000);
      });
      await act(() =>
        root?.update(
          <Screen>
            <Notice dismissible message="Drink logged." />
            <Notice message="New activity" />
          </Screen>,
        ),
      );
      await act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(text()).not.toContain('Drink logged.');
      expect(text()).toContain('New activity');
    } finally {
      vi.useRealTimers();
    }
  });
  it('continues an interrupted swipe from its on-screen position', async () => {
    await mount(createElement(DismissibleNotice, { message: 'Drink logged.' }));
    await act(() => {
      runtime.pan?.start?.();
      runtime.pan?.update?.({ translationX: 35, velocityX: 100 });
      runtime.pan?.start?.();
      runtime.pan?.update?.({ translationX: 5, velocityX: 100 });
    });
    expect(runtime.animatedStyle?.().transform[0]?.translateX).toBe(40);
  });
  it('floats messages outside scrolling content and the logging footer, then dismisses them', async () => {
    vi.useFakeTimers();
    try {
      await mount(
        <Screen footer={createElement('Text', null, 'Log drink')}>
          <Notice dismissible message="Chaser logged." />
        </Screen>,
      );
      const host = root?.root.findByProps({ host: true, message: 'Chaser logged.' });
      expect(host?.parent?.props['style']).toMatchObject({ position: 'absolute', top: 8 });
      expect(
        native('ScrollView')[0]?.findAllByType('GestureDetector' as unknown as React.ComponentType),
      ).toHaveLength(0);
      await act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(text()).not.toContain('Chaser logged.');
      expect(text()).toContain('Log drink');
    } finally {
      vi.useRealTimers();
    }
  });
  it('dismisses a warning by swiping and shows a different new message', async () => {
    await mount(createElement(DismissibleNotice, { message: "You've logged too many drinks" }));
    expect(runtime.pan?.active).toEqual([-16, 16]);
    expect(runtime.pan?.fail).toEqual([-12, 12]);
    await act(() => runtime.pan?.end?.({ translationX: -100, velocityX: -200 }));
    expect(root?.toJSON()).toBeNull();
    await act(() => root?.update(createElement(DismissibleNotice, { message: 'Drink logged.' })));
    expect(text()).toContain('Drink logged.');
    await press('Dismiss message');
    expect(root?.toJSON()).toBeNull();
  });
  it('keeps short swipes and cancelled gestures visible and supports reduced motion', async () => {
    await mount(createElement(DismissibleNotice, { message: 'Drink logged.' }));
    await act(() => runtime.pan?.end?.({ translationX: 20, velocityX: 100 }));
    expect(text()).toContain('Drink logged.');
    expect(runtime.spring).toHaveBeenCalledWith(0, expect.anything());
    await act(() => {
      runtime.pan?.update?.({ translationX: 30, velocityX: 100 });
      runtime.pan?.finalize?.({ translationX: 30, velocityX: 100 }, false);
    });
    expect(runtime.animatedStyle?.().transform[0]?.translateX).toBe(0);
    runtime.reduced = true;
    await act(() => root?.update(createElement(DismissibleNotice, { message: 'Saved.' })));
    await act(() => runtime.pan?.update?.({ translationX: 60, velocityX: -900 }));
    expect(runtime.animatedStyle?.().transform[0]?.translateX).toBe(0);
    await act(() => runtime.pan?.end?.({ translationX: 0, velocityX: -900 }));
    expect(root?.toJSON()).toBeNull();
    expect(root?.toJSON()).toBeNull();
  });
  it('does not make important persistent notices dismissible', async () => {
    await mount(
      createElement(Notice, { error: true, message: 'Confirm before removing this entry.' }),
    );
    expect(native('GestureDetector')).toHaveLength(0);
    expect(native('Pressable')).toHaveLength(0);
  });
});

describe('primary drink logging', () => {
  it('uses a large labeled button and logs directly from one tap', async () => {
    await mount(
      createElement(DrinkLogButton, {
        label: 'Beer',
        detail: '330 ml · 5%',
        primary: true,
        onPress: runtime.log,
      }),
    );
    const button = native('Pressable')[0];
    expect(button?.props['accessibilityLabel']).toBe('Log Beer. 330 ml · 5%');
    const styles = native('AnimatedView')[0]?.props['style'] as { minHeight?: number }[];
    expect(styles.some((style) => (style.minHeight ?? 0) >= 84)).toBe(true);
    await press('Log Beer. 330 ml · 5%');
    expect(runtime.log).toHaveBeenCalledOnce();
  });
});
