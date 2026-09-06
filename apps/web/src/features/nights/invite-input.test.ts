import { describe, expect, it } from 'vitest';
import { parseInviteInput } from './invite-input';

const token = 'a'.repeat(43);

describe('invitation input', () => {
  it.each([
    `  ${token}  `,
    `https://dwd.example/join/${token}`,
    `https://dwd.example/join/${token}/?source=share#invite`,
    `https://dwd.example/?join=${token}`,
  ])('accepts copied invite formats: %s', (input) => {
    expect(parseInviteInput(input)).toBe(token);
  });
  it.each([
    '',
    'invalid',
    `https://dwd.example/night/${token}`,
    `javascript:/${token}`,
    `https://dwd.example/join/${token}/extra`,
  ])('rejects malformed invitations: %s', (input) => {
    expect(parseInviteInput(input)).toBeNull();
  });
});
