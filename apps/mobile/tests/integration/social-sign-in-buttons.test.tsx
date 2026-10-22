/* eslint-disable @typescript-eslint/no-deprecated -- Check native provider controls without a device. */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppleButton } from '@/components/apple-button.ios';
import { GoogleButton } from '@/components/google-button';

const runtime = vi.hoisted(() => ({ scheme: 'dark', client: {}, apple: vi.fn(), google: vi.fn() }));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  Image: 'Image',
  ActivityIndicator: 'Spinner',
  Platform: { Version: '26' },
}));
vi.mock('@/components/primary-button', () => ({
  Action: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  PrimaryButton: 'PrimaryButton',
}));
vi.mock('@/components/screen', () => ({ Notice: 'Notice' }));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => ({}) }));
vi.mock('expo-constants', () => ({ default: {}, ExecutionEnvironment: {} }));
vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: vi.fn(),
}));
vi.mock('expo-apple-authentication', () => ({ isAvailableAsync: () => Promise.resolve(true) }));
vi.mock('@/lib/apple-auth', () => ({ appleSignIn: runtime.apple }));
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => ({ client: runtime.client }),
}));
vi.mock('@/providers/theme-provider', () => ({
  useTheme: () => ({ scheme: runtime.scheme, typography: {} }),
}));

let root: ReactTestRenderer | null = null;
const apple = (authenticate: () => Promise<boolean>) => {
  void authenticate();
};
async function mount(disabled = false, busy = false) {
  await act(async () => {
    const controls = (
      <>
        <GoogleButton disabled={disabled} busy={busy} onPress={runtime.google} />
        <AppleButton disabled={disabled} busy={busy} onSignIn={apple} />
      </>
    );
    if (root) root.update(controls);
    else root = create(controls);
    await Promise.resolve();
  });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.scheme = 'dark';
  vi.clearAllMocks();
  runtime.apple.mockResolvedValue(true);
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

it.each(['light', 'dark'])(
  'matches the provider label typography and button geometry in %s appearance',
  async (scheme) => {
    runtime.scheme = scheme;
    await mount();
    const labels = root?.root
      .findAll((node) => String(node.type) === 'Text')
      .map(
        (node) =>
          node.props['style'] as { fontSize: number; fontWeight: string; lineHeight: number },
      );
    expect(labels).toHaveLength(2);
    expect(labels?.[0]).toMatchObject({ fontSize: 17, fontWeight: '500' });
    expect(labels?.[1]).toMatchObject({
      fontSize: labels?.[0]?.fontSize,
      fontWeight: labels?.[0]?.fontWeight,
      lineHeight: labels?.[0]?.lineHeight,
    });
    const buttons = root?.root.findAllByType('button');
    expect(buttons?.[0]?.props['style']).toMatchObject({
      minHeight: buttons?.[1]?.props['style'].minHeight,
      borderRadius: buttons?.[1]?.props['style'].borderRadius,
    });
    expect(
      root?.root
        .findAll((node) => String(node.type) === 'Image')
        .every((node) => node.props['accessible'] === false),
    ).toBe(true);
  },
);

it('uses native Apple authentication and blocks additional taps while disabled or busy', async () => {
  await mount();
  const pressApple = () => {
    const button = root?.root.findAllByType('button')[1];
    (button?.props['onPress'] as () => void)();
  };
  await act(pressApple);
  expect(runtime.apple).toHaveBeenCalledOnce();
  expect(runtime.apple.mock.calls[0]?.[0]).toBe(runtime.client);
  await mount(true);
  await act(pressApple);
  await mount(false, true);
  await act(pressApple);
  expect(runtime.apple).toHaveBeenCalledOnce();
  expect(
    root?.root
      .findAllByType('button')
      .every((node) => node.props['disabled'] && node.props['busy']),
  ).toBe(true);
});
