/* eslint-disable @typescript-eslint/no-deprecated -- Mounted Help verification without placing emergency calls. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HelpScreen from '../../app/night/[nightId]/help';

const runtime = vi.hoisted(() => ({ open: vi.fn(), country: 'UG', source: 'default' }));
vi.mock('react-native', () => ({ Text: 'text', View: 'view', Linking: { openURL: runtime.open } }));
vi.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('@/providers/theme-provider', () => ({ useTheme: () => ({ colors: {}, typography: {} }) }));
vi.mock('@/providers/location-provider', () => ({
  useCountryLocation: () => ({
    location: { countryCode: runtime.country, source: runtime.source },
  }),
}));
vi.mock('@/components/primary-button', () => ({ PrimaryButton: 'button' }));
vi.mock('@/components/screen', () => ({ Screen: 'screen', Panel: 'panel', Notice: 'notice' }));
let root: ReactTestRenderer | null = null;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.country = 'UG';
  runtime.source = 'default';
  runtime.open.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});
async function mount() {
  await act(() => {
    root = create(createElement(HelpScreen));
  });
}
function buttons() {
  return root?.root.findAllByType('button') ?? [];
}
async function press(label: string) {
  const button = buttons().find((element) =>
    (element.props as { label: string }).label.startsWith(label),
  );
  if (!button) throw new Error('Button missing: ' + label);
  await act(() => {
    (button.props as { onPress: () => void }).onPress();
  });
}
describe('native automatic country-specific emergency calls', () => {
  it('offers Uganda calls immediately without asking for a country and labels the fallback', async () => {
    await mount();
    await press('Call 112');
    expect(runtime.open).toHaveBeenCalledWith('tel:112');
    expect(
      root?.root
        .findAll((element) => element.type === ('notice' as unknown))
        .some((notice) =>
          (notice.props as { message: string }).message.includes('These numbers are for Uganda'),
        ),
    ).toBe(true);
  });
  it('uses Rwanda location to open the local ambulance dialler', async () => {
    runtime.country = 'RW';
    runtime.source = 'location';
    await mount();
    await press('Call 912');
    expect(runtime.open).toHaveBeenCalledWith('tel:912');
  });
  it('updates Dubai numbers when the detected country changes without a manual selector', async () => {
    runtime.country = 'RW';
    await mount();
    runtime.country = 'AE';
    await act(() => root?.update(createElement(HelpScreen)));
    await press('Call 998');
    expect(runtime.open).toHaveBeenCalledWith('tel:998');
    expect(
      buttons().some((button) => (button.props as { label: string }).label.startsWith('Call 912')),
    ).toBe(false);
  });
  it('keeps the exact number visible after a failed dialler launch', async () => {
    runtime.country = 'ZA';
    runtime.open.mockRejectedValue(new Error('No dialler'));
    await mount();
    await press('Call 10177');
    expect(
      root?.root
        .findAll((element) => element.type === ('notice' as unknown))
        .map((element) => (element.props as { message: string }).message),
    ).toContain('Could not open the phone. Dial 10177 directly.');
  });
  it('does not place a call without a button press', async () => {
    await mount();
    expect(runtime.open).not.toHaveBeenCalled();
  });
});
