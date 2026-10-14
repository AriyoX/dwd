import { describe, expect, it, vi } from 'vitest';
import { startNightAction } from '@/features/nights/actions';
vi.mock('server-only', () => ({}));
const runtime = vi.hoisted(() => ({
  actor: 'da100000-0000-4000-8000-000000000002',
  start: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: {
        getClaims: () => Promise.resolve({ data: { claims: { sub: runtime.actor } }, error: null }),
      },
    }),
}));
vi.mock('@dwd/data', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  startNightOut: runtime.start,
}));
describe('account-bound quick night creation', () => {
  it('does not retry another account’s saved creation after credentials change', async () => {
    const result = await startNightAction(
      {
        creationKey: 'da200000-0000-4000-8000-000000000001',
        title: 'Saved quick destination',
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        timezone: 'UTC',
        withPeople: false,
        hostPlanItems: [],
        guests: [],
      },
      undefined,
      'da100000-0000-4000-8000-000000000001',
    );
    expect(result).toMatchObject({
      ok: false,
      error: 'Your account changed. Open this setup with the account that started it.',
    });
    expect(runtime.start).not.toHaveBeenCalled();
  });
});
