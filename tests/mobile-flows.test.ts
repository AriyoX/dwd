import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { DrinkLogCommand, DrinkLogResult } from '@dwd/core';
import { submitDrink } from '../apps/mobile/src/lib/logging';
import { hashInvite, newInviteToken, parseInvite } from '../apps/mobile/src/lib/invites';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytesAsync: (size: number) =>
    Promise.resolve(Uint8Array.from({ length: size }, (_, index) => index)),
  digestStringAsync: (_algorithm: string, value: string) =>
    Promise.resolve(createHash('sha256').update(value).digest('hex')),
}));

const command: DrinkLogCommand = {
  targetMemberId: '5caa5510-f3b7-430d-aad4-41088e51d0ee',
  planItemId: 'c36f3ea0-768e-4dc4-8e1b-4e558da2ea44',
  idempotencyKey: '67380554-9226-4b42-90bc-cb25bcfd0c90',
  consumedAt: '2026-10-01T18:00:00.000Z',
  acknowledgePlanExceeded: false,
  acknowledgeAfterEnd: false,
};

describe('native logging confirmation', () => {
  it('reuses the original identity and time when acknowledging both server warnings', async () => {
    const create = vi
      .fn<(input: DrinkLogCommand) => Promise<DrinkLogResult>>()
      .mockResolvedValueOnce({
        status: 'confirmation_required',
        warnings: ['plan_exceeded', 'after_end'],
        message: 'Beyond the plan and end time.',
      })
      .mockResolvedValueOnce({ status: 'temporarily_failed', message: 'Try again.' });
    const confirm = vi.fn().mockResolvedValue(true);
    await submitDrink(command, create, confirm);
    expect(confirm).toHaveBeenCalledWith('Beyond the plan and end time.');
    expect(create).toHaveBeenNthCalledWith(2, {
      ...command,
      acknowledgePlanExceeded: true,
      acknowledgeAfterEnd: true,
    });
    expect(command.acknowledgePlanExceeded).toBe(false);
  });
  it('does not save again when a person cancels a warning', async () => {
    const create = vi.fn().mockResolvedValue({
      status: 'confirmation_required',
      warnings: ['after_end'],
      message: 'After end time.',
    });
    expect(await submitDrink(command, create, () => Promise.resolve(false))).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('acknowledges only the warning the server requested', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'confirmation_required',
        warnings: ['after_end'],
        message: 'After end time.',
      })
      .mockResolvedValueOnce({
        status: 'permanently_rejected',
        code: 'ended',
        message: 'Night ended.',
      });
    await submitDrink(command, create, () => Promise.resolve(true));
    expect(create).toHaveBeenNthCalledWith(2, { ...command, acknowledgeAfterEnd: true });
  });
  it('surfaces a rejected request without offering to bypass authorization', async () => {
    const result = {
      status: 'permanently_rejected',
      code: 'forbidden',
      message: 'Not your member.',
    } as const;
    const create = vi.fn().mockResolvedValue(result);
    const confirm = vi.fn();
    expect(await submitDrink(command, create, confirm)).toEqual(result);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('native and web invite compatibility', () => {
  const token = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index)).toString(
    'base64url',
  );
  it('generates the same URL-safe 256-bit token format as the web', async () => {
    expect(await newInviteToken()).toBe(token);
    expect(token).toHaveLength(43);
  });
  it('hashes the exact token using SHA-256 hex for existing invitation RPCs', async () => {
    expect(await hashInvite(token)).toBe(createHash('sha256').update(token).digest('hex'));
  });
  it('accepts raw codes and both existing web invite URL formats', () => {
    expect(parseInvite(`  ${token}  `)).toBe(token);
    expect(parseInvite(`https://drinkwithdesire.com/join/${token}`)).toBe(token);
    expect(parseInvite(`https://drinkwithdesire.com/?join=${token}`)).toBe(token);
  });
  it('rejects unsupported protocols, arbitrary routes, and incomplete codes', () => {
    expect(parseInvite(`javascript:alert('${token}')`)).toBeNull();
    expect(parseInvite(`ftp://drinkwithdesire.com/join/${token}`)).toBeNull();
    expect(parseInvite(`https://drinkwithdesire.com/night/${token}`)).toBeNull();
    expect(parseInvite('1234')).toBeNull();
  });
});
