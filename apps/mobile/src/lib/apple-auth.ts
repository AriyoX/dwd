import { AuthFlowError, type AuthClient } from './auth-actions';
import { withRequestTimeout } from './request-timeout';

export interface AppleAuthAdapter {
  randomUUID: () => string;
  sha256: (value: string) => Promise<string>;
  authorize: (request: { nonce: string; state: string }) => Promise<{
    identityToken: string | null;
    authorizationCode: string | null;
    state: string | null;
    name: string | null;
  }>;
}

// Only the iOS adapter calls this. Authorization codes stay in memory during server capture.
export async function appleSignIn(client: AuthClient, adapter: AppleAuthAdapter): Promise<boolean> {
  try {
    const result = await withRequestTimeout((signal) =>
      client.functions.invoke('apple-account-token', { method: 'GET', signal }),
    );
    if (result.error) throw result.error;
  } catch {
    throw new AuthFlowError('Apple sign-in is unavailable. Try again or use email.');
  }
  const nonce = adapter.randomUUID();
  const state = adapter.randomUUID();
  let credential: Awaited<ReturnType<AppleAuthAdapter['authorize']>>;
  try {
    credential = await adapter.authorize({ nonce: await adapter.sha256(nonce), state });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ERR_REQUEST_CANCELED'
    )
      return false;
    throw new AuthFlowError('Apple sign-in is unavailable. Try again or use email.');
  }
  if (credential.state !== state || !credential.identityToken || !credential.authorizationCode)
    throw new AuthFlowError('Apple sign-in could not be verified. Please try again.');

  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce,
  });
  if (error) throw new AuthFlowError('Could not sign in with Apple. Try again or use email.');

  try {
    const result = await withRequestTimeout((signal) =>
      client.functions.invoke('apple-account-token', {
        method: 'POST',
        signal,
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        body: { authorizationCode: credential.authorizationCode },
      }),
    );
    if (result.error) throw result.error;
  } catch {
    const current = await client.auth.getSession();
    if (current.data.session?.user.id === data.session.user.id)
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    throw new AuthFlowError('Could not finish Apple sign-in. Try again when connected.');
  }

  // Apple supplies the name once. It is a form default, never proof of adulthood.
  // If saving it fails, complete-profile still asks for a display name.
  const name = credential.name?.trim().slice(0, 60);
  if (name) {
    try {
      const { data: current } = await client.auth.getSession();
      if (current.session?.user.id === data.session.user.id)
        await client.auth.updateUser({ data: { full_name: name } });
    } catch {
      // Authentication succeeded; optional name capture must not turn it into an error.
    }
  }
  return true;
}
