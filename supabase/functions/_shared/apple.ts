import {
  CompactEncrypt,
  compactDecrypt,
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  SignJWT,
} from 'npm:jose@6.2.12';

export interface AppleConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
  encryptionKey: Uint8Array;
}
export function appleConfig(read: (key: string) => string | undefined): AppleConfig {
  const teamId = read('DWD_APPLE_TEAM_ID');
  const keyId = read('DWD_APPLE_KEY_ID');
  const clientId = read('DWD_APPLE_CLIENT_ID');
  const privateKey = read('DWD_APPLE_PRIVATE_KEY');
  const encryption = read('DWD_APPLE_TOKEN_ENCRYPTION_KEY');
  if (
    !teamId ||
    !keyId ||
    !clientId ||
    !privateKey ||
    !encryption ||
    !/^[A-Z0-9]{10}$/.test(teamId) ||
    !/^[A-Z0-9]{10}$/.test(keyId) ||
    !/^[a-zA-Z0-9.-]{3,255}$/.test(clientId) ||
    !/^[a-fA-F0-9]{64}$/.test(encryption)
  )
    throw new Error('Apple account service is not configured.');
  return {
    teamId,
    keyId,
    clientId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    encryptionKey: Uint8Array.from(encryption.match(/../g) ?? [], (pair) => parseInt(pair, 16)),
  };
}
export async function appleClientSecret(config: AppleConfig) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuer(config.teamId)
    .setSubject(config.clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(await importPKCS8(config.privateKey, 'ES256'));
}
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'), {
  timeoutDuration: 10000,
});
async function identitySubject(token: string, clientId: string) {
  const { payload } = await jwtVerify(token, appleKeys, {
    issuer: 'https://appleid.apple.com',
    audience: clientId,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'iat', 'exp'],
  });
  if (!payload.sub) throw new Error('Apple identity unavailable.');
  return payload.sub;
}
export async function exchangeAppleCode(
  config: AppleConfig,
  code: string,
  subject: string,
  fetcher: typeof fetch = fetch,
  verify: typeof identitySubject = identitySubject,
) {
  const response = await fetcher('https://appleid.apple.com/auth/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: await appleClientSecret(config),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw new Error('Apple code exchange failed.');
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('id_token' in data) ||
    typeof data.id_token !== 'string' ||
    !('refresh_token' in data) ||
    typeof data.refresh_token !== 'string' ||
    data.refresh_token.length < 10 ||
    (await verify(data.id_token, config.clientId)) !== subject
  )
    throw new Error('Apple identity mismatch.');
  return data.refresh_token;
}
// The encrypted, authenticated owner field prevents transplanting ciphertext between accounts.
export async function encryptAppleToken(config: AppleConfig, userId: string, token: string) {
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify({ userId, token })))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(config.encryptionKey);
}
export async function decryptAppleToken(config: AppleConfig, userId: string, encrypted: string) {
  const { plaintext } = await compactDecrypt(encrypted, config.encryptionKey, {
    keyManagementAlgorithms: ['dir'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  const data: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (
    !data ||
    typeof data !== 'object' ||
    !('userId' in data) ||
    data.userId !== userId ||
    !('token' in data) ||
    typeof data.token !== 'string'
  )
    throw new Error('Apple credential owner mismatch.');
  return data.token;
}
export async function revokeAppleToken(
  config: AppleConfig,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: await appleClientSecret(config),
      token,
      token_type_hint: 'refresh_token',
    }),
  });
  // Apple's endpoint also returns 200 when the grant was already revoked; retries are safe.
  if (response.status !== 200) throw new Error('Apple authorization revocation failed.');
}
