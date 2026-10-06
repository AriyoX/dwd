/* eslint-disable @typescript-eslint/no-deprecated -- Offline Help verification without placing emergency calls. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELP_COUNTRY_KEY } from '@dwd/core';
import HelpScreen from '../../app/night/[nightId]/help';

const runtime = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('react-native', () => ({ Text: 'text', View: 'view', Linking: { openURL: runtime.open } }));
vi.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('@/providers/theme-provider', () => ({ useTheme: () => ({ colors: {}, typography: {} }) }));
vi.mock('@/components/primary-button', () => ({ PrimaryButton: 'button' }));
vi.mock('@/components/screen', () => ({ Screen: 'screen', Panel: 'panel', Notice: 'notice' }));
vi.mock('@/components/country-choice', () => ({ CountryChoice: 'country-choice' }));
let root: ReactTestRenderer | null = null;
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
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
async function selectCountry(code: string) {
  const choice = root?.root.findByProps({ label: 'Current country' });
  if (!choice) throw new Error('Country selection missing');
  await act(() => {
    (choice.props as { onChange: (code: string) => void }).onChange(code);
  });
}
async function press(label: string) {
  const button = buttons().find((element) =>
    (element.props as { label: string }).label.startsWith(label),
  );
  if (!button) throw new Error(`Button missing: ${label}`);
  await act(() => {
    (button.props as { onPress: () => void }).onPress();
  });
}
describe('native offline country-specific emergency calls', () => {
  it('does not offer Uganda calls before a current country is chosen', async () => {
    await mount();
    expect(
      buttons().some((button) => (button.props as { label: string }).label.startsWith('Call ')),
    ).toBe(false);
    expect(runtime.open).not.toHaveBeenCalled();
  });
  it('restores Rwanda while offline and opens the ambulance dialler with the local number', async () => {
    values.set(HELP_COUNTRY_KEY, 'RW');
    await mount();
    await press('Call 912');
    expect(runtime.open).toHaveBeenCalledWith('tel:912');
  });
  it('changes to Dubai without keeping Rwanda numbers or adding an international prefix', async () => {
    values.set(HELP_COUNTRY_KEY, 'RW');
    await mount();
    await selectCountry('AE');
    await press('Call 998');
    expect(runtime.open).toHaveBeenCalledWith('tel:998');
    expect(
      buttons().some((button) => (button.props as { label: string }).label.startsWith('Call 912')),
    ).toBe(false);
    expect(values.get(HELP_COUNTRY_KEY)).toBe('AE');
  });
  it('keeps the exact number visible after a failed dialler launch', async () => {
    values.set(HELP_COUNTRY_KEY, 'ZA');
    runtime.open.mockRejectedValue(new Error('No dialler'));
    await mount();
    await press('Call 10177');
    expect(
      root?.root
        .findAll((element) => typeof (element.props as { message?: unknown }).message === 'string')
        .map((element) => (element.props as { message: string }).message),
    ).toContain('Could not open the phone. Dial 10177 directly.');
  });
  it('clears saved calls when the traveller chooses an unsupported country', async () => {
    values.set(HELP_COUNTRY_KEY, 'KE');
    await mount();
    await press("My country isn't listed");
    expect(
      buttons().some((button) => (button.props as { label: string }).label.startsWith('Call ')),
    ).toBe(false);
    expect(values.get(HELP_COUNTRY_KEY)).toBe('');
  });
});
