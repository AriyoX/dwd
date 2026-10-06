import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { appleSignIn, type AppleAuthAdapter } from '../apps/mobile/src/lib/apple-auth';
import { AppleButton } from '../apps/mobile/src/components/apple-button';
import type { AuthClient } from '../apps/mobile/src/lib/auth-actions';

const auth = {
  signInWithIdToken: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
};
const invoke = vi.fn();
const rpc = vi.fn();
const client = { auth, rpc, functions: { invoke } } as unknown as AuthClient;
const credential = {
  identityToken: 'apple-token',
  authorizationCode: 'one-use-code',
  state: 'request-state',
  name: ' Alex ',
};
let adapter: AppleAuthAdapter;
beforeEach(() => {
  vi.resetAllMocks();
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  adapter = {
    randomUUID: vi.fn().mockReturnValueOnce('raw-nonce').mockReturnValueOnce('request-state'),
    sha256: (value) => Promise.resolve(createHash('sha256').update(value).digest('hex')),
    authorize: vi.fn().mockResolvedValue(credential),
  };
  auth.signInWithIdToken.mockResolvedValue({
    data: { session: { access_token: 'actor-token', user: { id: 'actor' } } },
    error: null,
  });
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'actor' } } }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
});

describe('iOS Apple authentication', () => {
  it('hashes the nonce for Apple and sends the raw nonce only to the Supabase verifier', async () => {
    expect(await appleSignIn(client, adapter)).toBe(true);
    expect(adapter.authorize).toHaveBeenCalledWith({
      nonce: createHash('sha256').update('raw-nonce').digest('hex'),
      state: 'request-state',
    });
    expect(auth.signInWithIdToken).toHaveBeenCalledExactlyOnceWith({
      provider: 'apple',
      token: 'apple-token',
      nonce: 'raw-nonce',
    });
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ data: { full_name: 'Alex' } });
    // OAuth identity/name alone must never create a profile or attest adulthood.
    expect(rpc).not.toHaveBeenCalled();
  });
  it('leaves repeat sign-ins without a supplied name untouched', async () => {
    adapter.authorize = vi.fn().mockResolvedValue({ ...credential, name: null });
    expect(await appleSignIn(client, adapter)).toBe(true);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('sends the one-use code only to the authenticated server with the initiating token', async () => {
    await appleSignIn(client, adapter);
    expect(invoke).toHaveBeenCalledWith(
      'apple-account-token',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer actor-token' },
        body: { authorizationCode: 'one-use-code' },
      }),
    );
  });
  it('rejects unconfigured Apple services before opening the OS sign-in sheet', async () => {
    invoke.mockResolvedValue({ error: new Error('Not configured') });
    await expect(appleSignIn(client, adapter)).rejects.toThrow('unavailable');
    expect(adapter.authorize).not.toHaveBeenCalled();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });
  it('ends the initiating local session after credential capture fails', async () => {
    invoke
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('Offline') });
    await expect(appleSignIn(client, adapter)).rejects.toThrow('Could not finish');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('does not sign out a different account after failed capture', async () => {
    invoke
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('Offline') });
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'other' } } } });
    await expect(appleSignIn(client, adapter)).rejects.toThrow('Could not finish');
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it('treats cancellation as recoverable without starting a Supabase session', async () => {
    adapter.authorize = vi.fn().mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    expect(await appleSignIn(client, adapter)).toBe(false);
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });
  it.each([
    { ...credential, state: 'another-request' },
    { ...credential, state: null },
    { ...credential, identityToken: null },
    { ...credential, authorizationCode: null },
  ])('rejects missing tokens and mismatched request state (%j)', async (response) => {
    adapter.authorize = vi.fn().mockResolvedValue(response);
    await expect(appleSignIn(client, adapter)).rejects.toThrow('could not be verified');
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });
  it('reports native errors without exposing their contents', async () => {
    adapter.authorize = vi.fn().mockRejectedValue(new Error('private Apple response'));
    await expect(appleSignIn(client, adapter)).rejects.toThrow('Apple sign-in is unavailable');
  });
  it('requires a verified Supabase session before saving the name', async () => {
    auth.signInWithIdToken.mockResolvedValue({
      data: { session: null },
      error: { message: 'bad nonce' },
    });
    await expect(appleSignIn(client, adapter)).rejects.toThrow('Could not sign in with Apple');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('does not overwrite another account after a session change', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'other' } } } });
    await appleSignIn(client, adapter);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('keeps successful authentication when optional name capture fails', async () => {
    auth.updateUser.mockRejectedValue(new Error('offline'));
    expect(await appleSignIn(client, adapter)).toBe(true);
  });
  it('renders no Apple control or authentication action on non-iOS platforms', () => {
    const onSignIn = vi.fn();
    expect(AppleButton({ disabled: false, busy: false, onSignIn })).toBeNull();
    expect(onSignIn).not.toHaveBeenCalled();
  });
});
