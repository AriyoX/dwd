import { describe, expect, it } from 'vitest';
import { reserveConfirmationAttempt } from './resend-cooldown';
describe('confirmation cooldown', () => {
  it('reserves before sending, blocks rapid retries, and allows a later retry', () => {
    expect(reserveConfirmationAttempt('one-email', 1000)).toBeNull();
    expect(reserveConfirmationAttempt('one-email', 1001)).toBe(61000);
    expect(reserveConfirmationAttempt('one-email', 61000)).toBeNull();
  });
  it('separates addresses', () => {
    expect(reserveConfirmationAttempt('different-email', 1001)).toBeNull();
  });
});
