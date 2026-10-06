import { equal, rejects } from 'node:assert/strict';
import { generateKeyPair, exportPKCS8, jwtVerify } from 'npm:jose@6.2.12';
import {
  appleClientSecret,
  appleConfig,
  decryptAppleToken,
  encryptAppleToken,
  exchangeAppleCode,
  revokeAppleToken,
} from '../_shared/apple.ts';

const keys = await generateKeyPair('ES256', { extractable: true });
const config = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  clientId: 'com.dwd.app',
  privateKey: await exportPKCS8(keys.privateKey),
  encryptionKey: crypto.getRandomValues(new Uint8Array(32)),
};
Deno.test(
  'Apple client assertion has the required issuer, app audience and short expiry',
  async () => {
    const { payload, protectedHeader } = await jwtVerify(
      await appleClientSecret(config),
      keys.publicKey,
      { issuer: config.teamId, audience: 'https://appleid.apple.com', subject: config.clientId },
    );
    equal(protectedHeader.kid, config.keyId);
    equal((payload.exp ?? 0) - (payload.iat ?? 0), 300);
  },
);
Deno.test('encrypted tokens cannot move between accounts or survive tampering', async () => {
  const encrypted = await encryptAppleToken(config, 'owner', 'private-refresh-token');
  equal(encrypted.includes('private-refresh-token'), false);
  equal(await decryptAppleToken(config, 'owner', encrypted), 'private-refresh-token');
  await rejects(() => decryptAppleToken(config, 'other', encrypted));
  const parts = encrypted.split('.');
  parts[3] = (parts[3]?.startsWith('A') ? 'B' : 'A') + parts[3]?.slice(1);
  await rejects(() => decryptAppleToken(config, 'owner', parts.join('.')));
});
Deno.test(
  'code exchange binds the verified Apple subject to the existing Supabase account',
  async () => {
    const fetcher: typeof fetch = (_input, init) => {
      const form = init?.body as URLSearchParams;
      equal(form.get('client_id'), 'com.dwd.app');
      equal(form.get('grant_type'), 'authorization_code');
      equal(form.has('redirect_uri'), false);
      return Promise.resolve(
        Response.json({ id_token: 'signed-apple-token', refresh_token: 'private-refresh-token' }),
      );
    };
    equal(
      await exchangeAppleCode(config, 'code', 'subject', fetcher, async () => 'subject'),
      'private-refresh-token',
    );
    await rejects(() => exchangeAppleCode(config, 'code', 'other', fetcher, async () => 'subject'));
    await rejects(() =>
      exchangeAppleCode(config, 'code', 'subject', fetcher, async () => {
        throw new Error('Bad signature');
      }),
    );
  },
);
Deno.test('revocation is idempotent on Apple HTTP 200 and fails closed otherwise', async () => {
  const fetcher: typeof fetch = (input, init) => {
    equal(input, 'https://appleid.apple.com/auth/revoke');
    equal((init?.body as URLSearchParams).get('token_type_hint'), 'refresh_token');
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  await revokeAppleToken(config, 'token', fetcher);
  await revokeAppleToken(config, 'token', fetcher);
  await rejects(() =>
    revokeAppleToken(config, 'token', () => Promise.resolve(new Response(null, { status: 503 }))),
  );
});
Deno.test('missing or malformed secret configuration cannot enable Apple sign-in', () => {
  let failed = false;
  try {
    appleConfig(() => undefined);
  } catch {
    failed = true;
  }
  equal(failed, true);
});
