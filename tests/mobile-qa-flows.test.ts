import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database, StartNightInput } from '@dwd/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DataAccessError } from '@dwd/data';
import type * as DataExports from '@dwd/data';
import { parseCustomDrink, customServing } from '../apps/mobile/src/lib/custom-drink';
import { newBottleDraft, materializeBottle } from '../apps/mobile/src/lib/night-features';
import {
  completeNightSetup,
  materializeNightDraft,
  newNightDraft,
  nightDraftKey,
  recoverNightSetup,
} from '../apps/mobile/src/lib/night-draft';
import {
  rememberTourSeen,
  saveTourProgress,
  shouldStartTour,
} from '../apps/mobile/src/lib/practice-tour';
import { ensureNightInvite, refreshNightInvite } from '../apps/mobile/src/lib/automatic-invite';
import { inviteStateKey, readInviteState } from '../apps/mobile/src/lib/invite-state';
import { RecoverableCommand } from '../apps/mobile/src/lib/recoverable-command';
import {
  entryFailureMessage,
  savedEntryFailureMessage,
} from '../apps/mobile/src/lib/entry-message';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  rotate: vi.fn(),
  revoke: vi.fn(),
  preview: vi.fn(),
  bytes: vi.fn(),
}));
vi.mock('@dwd/data', async (original) => {
  const actual = await original<typeof DataExports>();
  return {
    ...actual,
    createNightInvite: api.create,
    rotateNightInvite: api.rotate,
    revokeNightInviteOnce: api.revoke,
    getInvitePreview: api.preview,
  };
});
vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: api.bytes,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Buffer.from(bytes).toString('hex');
  },
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  api.bytes.mockImplementation(() => Promise.resolve(crypto.getRandomValues(new Uint8Array(32))));
  api.create.mockImplementation((_client: unknown, input: { expiresAt: string }) =>
    Promise.resolve({ expiresAt: input.expiresAt }),
  );
  api.rotate.mockImplementation((_client: unknown, input: { expiresAt: string }) =>
    Promise.resolve({ expiresAt: input.expiresAt }),
  );
  api.revoke.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('custom drink validation', () => {
  const draft = { label: ' My drink ', category: 'other' as const, volume: '330', abv: '5' };
  it('trims names and accepts decimal commas', () => {
    expect(parseCustomDrink({ ...draft, volume: '45,5', abv: '12,5' })).toEqual({
      success: true,
      data: { label: 'My drink', category: 'other', volumeMl: 45.5, abvPercent: 12.5 },
    });
  });
  it.each(['', ' ', '0', '-5', '96', '1e1', 'five', 'Infinity'])(
    'requires a valid alcohol strength for %j',
    (abv) => {
      expect(parseCustomDrink({ ...draft, abv })).toMatchObject({
        success: false,
        errors: { abv: expect.any(String) },
      });
    },
  );
  it.each(['', '0', '-1', '2001', '1e3'])('requires a valid serving for %j', (volume) => {
    expect(parseCustomDrink({ ...draft, volume })).toMatchObject({
      success: false,
      errors: { volume: expect.any(String) },
    });
  });
  it('rejects empty or oversized names and uses useful serving defaults', () => {
    for (const label of ['', '   ', 'x'.repeat(61)])
      expect(parseCustomDrink({ ...draft, label })).toMatchObject({
        success: false,
        errors: { label: expect.any(String) },
      });
    expect(customServing.spirit).toBe('30');
    expect(customServing.wine).toBe('150');
  });
});

describe('saved entry messages', () => {
  it('keeps understandable reasons and hides technical errors from older entries', () => {
    expect(savedEntryFailureMessage(entryFailureMessage('post_end_grace_expired'))).toBe(
      'More than 24 hours have passed since the night ended.',
    );
    expect(savedEntryFailureMessage('Backend server synchronization failure')).toBe(
      "Couldn't save this entry. Try again.",
    );
  });
});

describe('temporary setup lifecycle', () => {
  it('discards unsubmitted legacy drafts without touching an existing night or another account', () => {
    const device = storage();
    for (const owner of [id(1), id(2)])
      device.setItem(nightDraftKey(owner), JSON.stringify(newNightDraft(owner, id(10))));
    device.setItem('existing-night', id(3));
    expect(recoverNightSetup(device, id(1))).toBeNull();
    expect(device.getItem(nightDraftKey(id(1)))).toBeNull();
    expect(device.getItem(nightDraftKey(id(2)))).not.toBeNull();
    expect(device.getItem('existing-night')).toBe(id(3));
  });
  it('retains an uncertain submitted start with the exact command and creation ID', () => {
    const device = storage();
    const draft = {
      ...newNightDraft(id(1), id(10)),
      mode: 'water_only' as const,
      step: 3 as const,
    };
    const attempt = materializeNightDraft(draft);
    device.setItem(nightDraftKey(id(1)), JSON.stringify({ ...draft, attempt }));
    expect(recoverNightSetup(device, id(1))?.attempt).toEqual(attempt);
  });
  it('clears completed setup and ignores a completion marker after failed cleanup', () => {
    const device = storage();
    const draft = newNightDraft(id(1), id(10));
    completeNightSetup(device, draft, id(3));
    expect(recoverNightSetup(device, id(1))).toBeNull();
    expect(() =>
      completeNightSetup(
        {
          ...device,
          removeItem: () => {
            throw new Error('Disk busy');
          },
        },
        draft,
        id(3),
      ),
    ).toThrow('Disk busy');
    expect(recoverNightSetup(device, id(1))).toBeNull();
  });
  it('starts a shared bottle without placeholder member IDs or a second host plan', () => {
    const draft = {
      ...newNightDraft(id(1), id(10)),
      bottle: { ...newBottleDraft(id(20)), label: 'Gin', defaultQuantity: '3' },
    };
    const command: StartNightInput = materializeNightDraft(draft);
    expect(command).toMatchObject({
      hostPlanItems: [],
      sharedBottle: {
        id: id(20),
        label: 'Gin',
        volumeMl: 750,
        pourMl: 30,
        defaultQuantity: 3,
        access: 'everyone',
        allowedMemberIds: [],
      },
    });
    expect(() =>
      materializeNightDraft({ ...draft, bottle: { ...draft.bottle, pourMl: '751' } }),
    ).toThrow('serving');
    expect(() => materializeNightDraft({ ...draft, withPeople: false })).toThrow(
      'Choose your plan',
    );
    expect(
      materializeBottle(
        { ...draft.bottle, access: 'selected', allowedMemberIds: [id(5)] },
        id(4),
        id(2),
      ),
    ).toMatchObject({ success: true, data: { allowedMemberIds: [id(5), id(2), id(4)] } });
  });
});

describe('first-use tour preference', () => {
  it('starts for a new account once and honors the web preference', () => {
    const device = storage();
    expect(shouldStartTour(device, id(1), false)).toBe(true);
    rememberTourSeen(device, id(1));
    expect(shouldStartTour(device, id(1), false)).toBe(false);
    expect(shouldStartTour(device, id(2), false)).toBe(true);
    expect(shouldStartTour(device, id(2), true)).toBe(false);
  });
  it.each(['complete', 'skipped'] as const)('respects existing %s progress', (status) => {
    const device = storage();
    saveTourProgress(device, id(1), { step: 3, status });
    expect(shouldStartTour(device, id(1), false)).toBe(false);
  });
});

describe('automatic invitation identity', () => {
  const client = {} as SupabaseClient<Database>;
  it.each(['+00:00', '+03:00'])(
    'restores server dates with %s and reuses a link five minutes later',
    async (offset) => {
      const device = storage();
      const now = Date.now();
      const serverDate = new Date(now + 24 * 3_600_000).toISOString().replace('Z', offset);
      api.create.mockResolvedValueOnce({ expiresAt: serverDate });
      const saved = await ensureNightInvite(device, client, id(1), id(3));
      expect(saved.expiresAt).toBe(new Date(serverDate).toISOString());
      // Also recover links already written by the previous app version.
      device.setItem(
        inviteStateKey(id(1), id(3)),
        JSON.stringify({ ...saved, expiresAt: serverDate }),
      );
      vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60_000);
      const restored = await ensureNightInvite(device, client, id(1), id(3));
      expect(restored).toEqual(saved);
      expect(api.create).toHaveBeenCalledOnce();
    },
  );
  it('keeps a saved link usable when the validation request fails', async () => {
    const device = storage();
    const saved = await ensureNightInvite(device, client, id(1), id(3));
    api.preview.mockRejectedValueOnce(new Error('Offline'));
    expect(await refreshNightInvite(device, client, id(1), id(3))).toEqual(saved);
    expect(api.create).toHaveBeenCalledOnce();
  });
  it.each(['expired', 'full', 'invalid'])(
    'automatically renews a server-reported %s link',
    async (reason) => {
      const device = storage();
      const saved = await ensureNightInvite(device, client, id(1), id(3));
      api.preview.mockResolvedValueOnce({ valid: false, reason });
      const fresh = await refreshNightInvite(device, client, id(1), id(3));
      expect(fresh.token).not.toBe(saved.token);
      expect(fresh.disabled).toBe(false);
      expect(Date.parse(fresh.expiresAt ?? '') - Date.now()).toBeGreaterThan(23 * 3_600_000);
      expect(api.rotate).not.toHaveBeenCalled();
    },
  );
  it('does not renew a link revoked on another phone', async () => {
    const device = storage();
    await ensureNightInvite(device, client, id(1), id(3));
    api.preview.mockResolvedValueOnce({ valid: false, reason: 'revoked' });
    expect(await refreshNightInvite(device, client, id(1), id(3))).toMatchObject({
      disabled: true,
      token: null,
    });
    await refreshNightInvite(device, client, id(1), id(3));
    expect(api.create).toHaveBeenCalledOnce();
  });
  it('does not undo a revocation made while validation was in flight', async () => {
    const device = storage();
    await ensureNightInvite(device, client, id(1), id(3));
    api.preview.mockImplementationOnce(async () => {
      await ensureNightInvite(device, client, id(1), id(3), 'revoke');
      return { valid: false, reason: 'expired' };
    });
    expect(await refreshNightInvite(device, client, id(1), id(3))).toMatchObject({
      disabled: true,
    });
    expect(api.create).toHaveBeenCalledOnce();
  });
  it('coalesces simultaneous creation and reuses the link after a restart', async () => {
    const device = storage();
    const first = ensureNightInvite(device, client, id(1), id(3));
    const second = ensureNightInvite(device, client, id(1), id(3));
    expect(second).toBe(first);
    const saved = await first;
    expect(saved.token).toHaveLength(43);
    expect(saved.pending).toBeNull();
    expect(await ensureNightInvite(device, client, id(1), id(3))).toEqual(saved);
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.bytes).toHaveBeenCalledOnce();
    const input = api.create.mock.calls[0]?.[1] as { tokenHash: string };
    expect(input.tokenHash).toHaveLength(64);
    expect(input.tokenHash).not.toBe(saved.token);
  });
  it('persists identity before sending and resumes the same lost request', async () => {
    const device = storage();
    api.create.mockRejectedValueOnce(new Error('Network response lost'));
    await expect(ensureNightInvite(device, client, id(1), id(3))).rejects.toThrow('lost');
    const pending = readInviteState(device, id(1), id(3));
    expect(pending.pending?.kind).toBe('create');
    const saved = await ensureNightInvite(device, client, id(1), id(3));
    expect(saved.token).toBe(pending.pending?.token);
    expect(api.create.mock.calls[0]).toEqual(api.create.mock.calls[1]);
    expect(api.bytes).toHaveBeenCalledOnce();
  });
  it('resumes replacement and never re-enables an explicitly revoked link', async () => {
    const device = storage();
    await ensureNightInvite(device, client, id(1), id(3));
    api.rotate.mockRejectedValueOnce(new Error('Network response lost'));
    await expect(ensureNightInvite(device, client, id(1), id(3), 'replace')).rejects.toThrow();
    await ensureNightInvite(device, client, id(1), id(3));
    expect(api.rotate.mock.calls[0]).toEqual(api.rotate.mock.calls[1]);
    const revoked = await ensureNightInvite(device, client, id(1), id(3), 'revoke');
    expect(revoked).toMatchObject({ token: null, pending: null, disabled: true });
    await ensureNightInvite(device, client, id(1), id(3));
    expect(api.create).toHaveBeenCalledOnce();
    const replacement = await ensureNightInvite(device, client, id(1), id(3), 'replace');
    expect(replacement.disabled).toBe(false);
    expect(replacement.token).not.toBeNull();
  });
  it('does not send an invite when its identity cannot be saved', async () => {
    const device = storage();
    await expect(
      ensureNightInvite(
        {
          ...device,
          setItem: () => {
            throw new Error('Disk full');
          },
        },
        client,
        id(1),
        id(3),
      ),
    ).rejects.toThrow('Disk full');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('automatically renews an expired invitation and an expired unfinished creation', async () => {
    const device = storage();
    const expired = new Date(Date.now() - 1).toISOString();
    const original = await ensureNightInvite(device, client, id(1), id(3));
    device.setItem(
      inviteStateKey(id(1), id(3)),
      JSON.stringify({ ...original, expiresAt: expired }),
    );
    const renewed = await ensureNightInvite(device, client, id(1), id(3));
    expect(renewed.token).not.toBe(original.token);
    expect(Date.parse(renewed.expiresAt ?? '')).toBeGreaterThan(Date.now());
    api.create.mockRejectedValueOnce(new Error('Response lost'));
    await expect(ensureNightInvite(device, client, id(1), id(4))).rejects.toThrow('lost');
    const unfinished = readInviteState(device, id(1), id(4));
    device.setItem(
      inviteStateKey(id(1), id(4)),
      JSON.stringify({ ...unfinished, pending: { ...unfinished.pending, expiresAt: expired } }),
    );
    const recovered = await ensureNightInvite(device, client, id(1), id(4));
    expect(recovered.token).not.toBe(unfinished.pending?.token);
    expect(recovered.pending).toBeNull();
  });
  it('retains an unfinished revocation even after its local operation timestamp expires', async () => {
    const device = storage();
    await ensureNightInvite(device, client, id(1), id(3));
    api.revoke.mockRejectedValueOnce(new Error('Response lost'));
    await expect(ensureNightInvite(device, client, id(1), id(3), 'revoke')).rejects.toThrow('lost');
    const unfinished = readInviteState(device, id(1), id(3));
    device.setItem(
      inviteStateKey(id(1), id(3)),
      JSON.stringify({
        ...unfinished,
        pending: { ...unfinished.pending, expiresAt: new Date(Date.now() - 1).toISOString() },
      }),
    );
    const revoked = await ensureNightInvite(device, client, id(1), id(3));
    expect(revoked.disabled).toBe(true);
    expect(api.revoke.mock.calls[0]).toEqual(api.revoke.mock.calls[1]);
    expect(api.create).toHaveBeenCalledOnce();
  });
  it('isolates invitations by account and night', async () => {
    const device = storage();
    const first = await ensureNightInvite(device, client, id(1), id(3));
    const second = await ensureNightInvite(device, client, id(2), id(3));
    const third = await ensureNightInvite(device, client, id(1), id(4));
    expect(new Set([first.token, second.token, third.token]).size).toBe(3);
    expect(api.create).toHaveBeenCalledTimes(3);
  });
});

describe('bottle form retry identity', () => {
  it('freezes the payload across an uncertain error and permits editing after a definite rejection', () => {
    const command = new RecoverableCommand<{ key: string; size: number }>();
    const first = command.capture(() => ({ key: id(1), size: 30 }));
    command.reject(new DataAccessError('Connection lost', 'network'));
    expect(command.capture(() => ({ key: id(2), size: 45 }))).toBe(first);
    expect(command.pending).toBe(true);
    command.reject(new DataAccessError('Stale revision', '40001'));
    expect(command.pending).toBe(false);
    expect(command.capture(() => ({ key: id(2), size: 45 }))).toEqual({ key: id(2), size: 45 });
    command.complete();
    expect(command.pending).toBe(false);
  });
});
