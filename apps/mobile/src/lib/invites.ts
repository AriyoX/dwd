import * as Crypto from 'expo-crypto';
import { inviteTokenSchema } from '@dwd/core';

export function parseInvite(value: string): string | null {
  const input = value.trim();
  if (inviteTokenSchema.safeParse(input).success) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const token =
      url.pathname.match(/^\/join\/([^/]+)\/?$/)?.[1] ??
      (url.pathname === '/' ? url.searchParams.get('join') : null);
    return token && inviteTokenSchema.safeParse(token).success ? token : null;
  } catch {
    return null;
  }
}
export const hashInvite = (token: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token);
export async function newInviteToken(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  // Match the web's 256-bit base64url tokens without relying on browser btoa.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let output = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      output += alphabet.charAt((value >>> bits) & 63);
    }
  }
  if (bits > 0) output += alphabet.charAt((value << (6 - bits)) & 63);
  return output;
}
