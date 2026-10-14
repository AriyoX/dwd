/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-non-null-assertion -- The mounted fixture creates every asserted screen and button. */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useMemo } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightTheme } from '@dwd/core';
import QuickLogScreen from '../../app/quick-log';
import QuickTransferScreen from '../../app/quick-transfer';
import StartTonightScreen from '../../app/start-tonight';
import QuickBenefitsScreen from '../../app/quick-benefits';
import { QuickSyncProvider } from '@/providers/quick-sync-provider';
import { nativeQuickOffer, nativeQuickStore } from '@/lib/quick-log';

const runtime = vi.hoisted(() => ({
  values: new Map<string, string>(),
  params: {} as { scope?: string; sessionId?: string; next?: string },
  account: null as null | { user: { id: string } },
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    canGoBack: () => false,
    back: vi.fn(),
    setParams: vi.fn((params: { scope: string }) => {
      runtime.params = { ...runtime.params, ...params };
    }),
  },
  haptic: vi.fn(),
  announce: vi.fn(),
  uuid: 0,
  failWrites: false,
  getNights: vi.fn(() => Promise.resolve([])),
  getSnapshot: vi.fn(),
  remember: vi.fn(),
  saveSession: vi.fn((_client: unknown, session: unknown) => Promise.resolve(session)),
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => runtime.params,
  useRouter: () => runtime.router,
}));
vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 3 }),
  AccessibilityInfo: { announceForAccessibility: runtime.announce },
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('expo-sqlite/kv-store', () => ({
  Storage: {
    getItemSync: (key: string) => runtime.values.get(key) ?? null,
    setItemSync: (key: string, value: string | ((prev: string | null) => string)) => {
      if (runtime.failWrites) throw new Error('Storage full');
      runtime.values.set(
        key,
        typeof value === 'function' ? value(runtime.values.get(key) ?? null) : value,
      );
    },
  },
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'bd200000-0000-4000-8000-' + (++runtime.uuid).toString().padStart(12, '0'),
}));
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: runtime.haptic,
}));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@dwd/data', () => ({
  getActiveNights: runtime.getNights,
  getNightSnapshot: runtime.getSnapshot,
  importQuickLogs: vi.fn(),
  saveQuickSession: runtime.saveSession,
  getQuickSessions: () => Promise.resolve([]),
}));
vi.mock('@/providers/connectivity-provider', () => ({ useConnectivity: () => ({ online: true }) }));
vi.mock('@/lib/auth-state', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  authHandoff: () => ({ remember: runtime.remember }),
}));
const client = {};
vi.mock('@/providers/supabase-provider', () => ({
  useSupabase: () => {
    const account = runtime.account;
    const session = useMemo(
      () => (account ? { ...account, user: { ...account.user, user_metadata: {} } } : null),
      [account],
    );
    return { client, session, status: account ? 'signed-in' : 'signed-out' };
  },
}));
vi.mock('@/providers/theme-provider', () => ({
  useTheme: () => ({ colors: lightTheme, typography: { heading: {}, sectionTitle: {}, body: {} } }),
}));
vi.mock('@/components/primary-button', () => ({
  Action: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  PrimaryButton: (props: { label: string; onPress: () => void; disabled?: boolean }) => (
    <button {...props}>{props.label}</button>
  ),
}));
vi.mock('@/components/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Notice: ({ message }: { message: string }) => <p>{message}</p>,
  ScreenHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/choice', () => ({
  Choice: (props: { label: string; onPress: () => void }) => (
    <button {...props}>{props.label}</button>
  ),
}));
vi.mock('@/components/auth-chrome', () => ({
  LegalLinks: () => <footer>For adults 18+ · Terms · Privacy</footer>,
}));
let root: ReactTestRenderer | null = null;
async function render() {
  await act(() => {
    root = create(<QuickLogScreen />);
  });
}
function button(label: string) {
  return root!.root.findAllByType('button').find((item) => item.props['label'] === label);
}
async function press(label: string) {
  await act(() => {
    const action = button(label)!.props['onPress'] as () => void;
    action();
  });
}
function content() {
  return JSON.stringify(root!.toJSON());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtime.params = {};
  runtime.account = null;
  runtime.failWrites = false;
  runtime.router.push.mockClear();
  runtime.getNights.mockClear();
  runtime.getSnapshot.mockClear();
  runtime.remember.mockClear();
  runtime.saveSession.mockClear();
  runtime.haptic.mockClear();
  runtime.announce.mockClear();
  const guest = nativeQuickStore('guest');
  for (const session of guest.getSnapshot().record.sessions) guest.deleteSession(session.id);
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
});
describe('native public Quick Log', () => {
  it('keeps unsaved guest entries in the logger before starting an authentication handoff', async () => {
    nativeQuickStore('guest').acknowledgeEligibility();
    await render();
    runtime.failWrites = true;
    await press('Log one drink');
    await press('Sign in / Create account');
    expect(runtime.router.push).not.toHaveBeenCalled();
    expect(content()).toContain('1 drink · 0 chasers');
    expect(content()).toContain('Save your logs on this device before signing in');
    runtime.failWrites = false;
    await press('Retry saving');
    await press('Sign in / Create account');
    expect(runtime.router.push).toHaveBeenCalled();
  });
  it('offers Quick Log or the existing planned setup from the native Start Tonight sheet', async () => {
    await act(() => {
      root = create(<StartTonightScreen />);
    });
    await press('Quick Log');
    expect(runtime.router.replace).toHaveBeenLastCalledWith('/quick-log?scope=account');
    await press('Plan a Night');
    expect(runtime.router.replace).toHaveBeenLastCalledWith('/night/new');
  });
  it('discovers account benefits without losing the session or sign-in destination', async () => {
    nativeQuickStore('guest').acknowledgeEligibility();
    await render();
    await press('Log one drink');
    const id = nativeQuickStore('guest').session()?.id;
    await press('Sign in / Create account');
    expect(runtime.router.push).toHaveBeenLastCalledWith({
      pathname: '/quick-benefits',
      params: { next: `/quick-log?scope=account&sessionId=${id}` },
    });
    runtime.params = { next: `/quick-log?scope=account&sessionId=${id}` };
    await act(() => root?.update(<QuickBenefitsScreen />));
    expect(content()).toContain('Photo memories');
    await press('Keep logging as a guest');
    expect(nativeQuickStore('guest').session()?.entries).toHaveLength(1);
    await press('Sign in');
    expect(runtime.remember).toHaveBeenCalledWith(runtime.params.next);
    expect(runtime.router.replace).toHaveBeenLastCalledWith('/auth/sign-in');
  });
  it('automatically associates guest entries on sign-in through the native provider and preserves the current logger', async () => {
    nativeQuickStore('guest').acknowledgeEligibility();
    await act(() => {
      root = create(
        <QuickSyncProvider>
          <QuickLogScreen />
        </QuickSyncProvider>,
      );
    });
    await press('Log one drink');
    await press('Chaser');
    const id = nativeQuickStore('guest').session()?.id;
    runtime.account = { user: { id: 'bd100000-0000-4000-8000-000000000077' } };
    await act(() => {
      root?.update(
        <QuickSyncProvider>
          <QuickLogScreen />
        </QuickSyncProvider>,
      );
    });
    expect(content()).toContain('1 drink · 1 chaser');
    expect(nativeQuickStore(`account:${runtime.account.user.id}`).session()?.id).toBe(id);
    expect(runtime.saveSession).toHaveBeenCalledOnce();
    await press('Undo last action');
    expect(content()).toContain('1 drink · 0 chasers');
  });
  it('keeps drink and chaser actions independent, with corrections, Undo and finish on both', async () => {
    nativeQuickStore('guest').acknowledgeEligibility();
    await render();
    await press('Chaser');
    expect(content()).toContain('0 drinks · 1 chaser');
    await press('Log one drink');
    await press('Recent activity');
    await press('Change to Chaser');
    expect(content()).toContain('0 drinks · 2 chasers');
    await press('Undo last action');
    expect(content()).toContain('1 drink · 1 chaser');
    await press('Finish session');
    expect(button('Log one drink')!.props['disabled']).toBe(true);
    expect(button('Chaser')!.props['disabled']).toBe(true);
  });
  it('returns a signed-in direct entry to Tonight instead of Welcome', async () => {
    runtime.account = { user: { id: 'bd100000-0000-4000-8000-000000000080' } };
    await render();
    await press('Back');
    expect(runtime.router.replace).toHaveBeenLastCalledWith('/');
  });
  it('stays on transfer when saving the sign-in handoff fails', async () => {
    const store = nativeQuickStore('guest');
    store.acknowledgeEligibility();
    store.log('drink');
    await act(() => {
      root = create(<QuickTransferScreen />);
    });
    runtime.failWrites = true;
    await press('Sign in to add logs');
    expect(runtime.router.push).not.toHaveBeenCalled();
    expect(content()).toContain('Retry saving before continuing');
    runtime.failWrites = false;
    await press('Retry saving');
    await press('Sign in to add logs');
    expect(runtime.router.push).toHaveBeenCalledWith('/auth/sign-in');
  });
  it('requires a saved handoff before creating or joining a night', async () => {
    runtime.account = { user: { id: 'bd100000-0000-4000-8000-000000000099' } };
    runtime.params = { scope: 'guest' };
    const store = nativeQuickStore('guest');
    store.acknowledgeEligibility();
    store.log('drink');
    await act(() => {
      root = create(<QuickTransferScreen />);
    });
    runtime.failWrites = true;
    await press('Create a night');
    await press('Join with an invite link');
    expect(runtime.router.push).not.toHaveBeenCalled();
    expect(content()).toContain('Retry saving before continuing');
    runtime.failWrites = false;
    await press('Retry saving');
    await press('Create a night');
    expect(runtime.router.push).toHaveBeenCalledWith('/night/new');
  });
  it('does not load a destination saved for a different quick session', async () => {
    const accountId = 'bd100000-0000-4000-8000-000000000098';
    runtime.account = { user: { id: accountId } };
    const store = nativeQuickStore('guest');
    store.acknowledgeEligibility();
    const old = store.log('drink');
    store.setIntent({
      sessionId: old.sessionId,
      accountId,
      nightId: 'bd300000-0000-4000-8000-000000000001',
      destination: 'choose',
    });
    store.startNew();
    const current = store.log('chaser');
    runtime.params = { scope: 'guest', sessionId: current.sessionId };
    await act(() => {
      root = create(<QuickTransferScreen />);
    });
    expect(runtime.getNights).toHaveBeenCalled();
    expect(runtime.getSnapshot).not.toHaveBeenCalled();
    expect(content()).toContain('0 drinks · 1 chaser');
  });
  it('keeps guest counts selected when authentication restores after the first tap', async () => {
    await render();
    if (button('I am 18 or older and meet the local legal drinking age.'))
      await press('I am 18 or older and meet the local legal drinking age.');
    await press('Log one drink');
    runtime.account = { user: { id: 'bd100000-0000-4000-8000-000000000009' } };
    await act(() => root?.update(<QuickLogScreen />));
    expect(content()).toContain('1 drink · 0 chasers');
    await press('Chaser');
    expect(content()).toContain('1 drink · 1 chaser');
  });
  it('keeps an explicit guest creation intent separate from an existing account session', () => {
    const accountId = 'bd100000-0000-4000-8000-000000000003';
    const own = nativeQuickStore(`account:${accountId}`);
    own.acknowledgeEligibility();
    own.log('chaser');
    const guest = nativeQuickStore('guest');
    guest.acknowledgeEligibility();
    guest.log('drink');
    const id = guest.session()!.id;
    guest.setIntent({ sessionId: id, accountId, nightId: null, destination: 'create' });
    expect(nativeQuickOffer(accountId, 'create')).toEqual({ scope: 'guest', sessionId: id });
    expect(nativeQuickOffer(accountId, 'invite')).toBeNull();
    const destination = 'bd300000-0000-4000-8000-000000000001';
    guest.setIntent({ sessionId: id, accountId, nightId: destination, destination: 'choose' });
    expect(nativeQuickOffer(accountId, 'create', destination)).toEqual({
      scope: 'guest',
      sessionId: id,
    });
  });
  it('logs distinct rapid taps before any account exists, announces feedback and persists across remount', async () => {
    await render();
    if (button('I am 18 or older and meet the local legal drinking age.'))
      await press('I am 18 or older and meet the local legal drinking age.');
    await act(() => {
      for (let i = 0; i < 2; i++) {
        (button('Log one drink')!.props['onPress'] as () => void)();
      }
    });
    expect(button('Log one drink')).toBeDefined();
    expect(content()).toContain('2 drinks · 0 chasers');
    await press('Chaser');
    expect(content()).toContain('2 drinks · 1 chaser');
    expect(runtime.announce).toHaveBeenCalled();
    expect(runtime.haptic).not.toHaveBeenCalled();
    await press('Undo last action');
    expect(content()).toContain('2 drinks · 0 chasers');
    await act(() => root?.unmount());
    await render();
    expect(content()).toContain('2 drinks · 0 chasers');
    expect(content()).not.toContain('Saved on this device');
    expect(content()).not.toContain('Counts only');
    expect(nativeQuickStore('guest').getSnapshot().saved).toBe(true);
    expect(button('Past quick sessions')).toBeUndefined();
    await press('Session options');
    expect(button('Past quick sessions')).toBeDefined();
  });
  it('switches to an empty account scope and resumes preserved guest logs after sign-out', async () => {
    await render();
    if (button('I am 18 or older and meet the local legal drinking age.'))
      await press('I am 18 or older and meet the local legal drinking age.');
    await press('Log one drink');
    await press('Log one drink');
    runtime.account = { user: { id: 'bd100000-0000-4000-8000-000000000001' } };
    runtime.params = { scope: 'account' };
    await act(() => root?.update(<QuickLogScreen />));
    expect(content()).toContain('0 drinks · 0 chasers');
    await press('I am 18 or older and meet the local legal drinking age.');
    await press('Chaser');
    runtime.account = null;
    await act(() => root?.update(<QuickLogScreen />));
    expect(content()).toContain('2 drinks · 0 chasers');
    expect(content()).not.toContain('0 drinks · 1 chaser');
    runtime.account = { user: { id: 'bd100000-0000-4000-8000-000000000002' } };
    await act(() => root?.update(<QuickLogScreen />));
    expect(content()).toContain('0 drinks · 0 chasers');
  });
});
