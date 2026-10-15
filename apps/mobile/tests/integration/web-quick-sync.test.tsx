/* eslint-disable @typescript-eslint/no-deprecated -- Reuse the workspace's existing React renderer for the web coordinator's effect lifecycle. */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountQuickSync } from '../../../web/src/features/quick-log/account-sync';

type Session = { user: { id: string }; access_token: string };
const runtime = vi.hoisted(() => ({
  listener: (() => {}) as (event: string, session: Session | null) => void,
  lookups: [] as ((value: { data: { session: Session | null } }) => void)[],
  sync: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));
vi.mock('@dwd/contracts', () => ({ synchronizeQuickLogs: runtime.sync }));
vi.mock('../../../web/src/lib/supabase/browser', () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      onAuthStateChange: (listener: typeof runtime.listener) => {
        runtime.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => new Promise((resolve) => runtime.lookups.push(resolve)),
    },
  }),
}));
vi.mock('../../../web/src/features/quick-log/local', () => ({
  browserQuickStore: () => ({ subscribe: () => () => {} }),
  browserLocks: () => null,
  quickWriterName: () => '',
}));
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  runtime.lookups = [];
  runtime.sync.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(async () => {
  await act(() => root?.unmount());
  vi.unstubAllGlobals();
});
it.each(['SIGNED_OUT', 'SIGNED_IN'])(
  'ignores restored credentials older than %s',
  async (event) => {
    await act(() => {
      root = create(<AccountQuickSync />);
    });
    expect(runtime.lookups).toHaveLength(2);
    const latest =
      event === 'SIGNED_OUT' ? null : { user: { id: 'new-account' }, access_token: 'new' };
    await act(() => {
      runtime.listener(event, latest);
    });
    await act(() => {
      for (const resolve of runtime.lookups)
        resolve({ data: { session: { user: { id: 'old-account' }, access_token: 'old' } } });
    });
    if (!latest) expect(runtime.sync).not.toHaveBeenCalled();
    else {
      expect(runtime.sync).toHaveBeenCalled();
      for (const call of runtime.sync.mock.calls)
        expect(call).toEqual([expect.objectContaining({ accountId: 'new-account' })]);
    }
  },
);
