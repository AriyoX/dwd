import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import {
  appleClientSecret,
  appleConfig,
  encryptAppleToken,
  exchangeAppleCode,
} from '../_shared/apple.ts';
import { createAppleTokenHandler } from './handler.ts';
const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Supabase credentials are missing.');
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
});
Deno.serve(
  createAppleTokenHandler({
    async ready() {
      await appleClientSecret(appleConfig((name) => Deno.env.get(name)));
    },
    async authenticate(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      const subject: unknown = data.user.identities?.find(
        (identity) => identity.provider === 'apple',
      )?.identity_data?.['sub'];
      return typeof subject === 'string' ? { userId: data.user.id, subject } : null;
    },
    async capture(owner, code) {
      const config = appleConfig((name) => Deno.env.get(name));
      const token = await exchangeAppleCode(config, code, owner.subject);
      const encrypted = await encryptAppleToken(config, owner.userId, token);
      const { error } = await client.rpc('store_apple_revocation_token', {
        p_user_id: owner.userId,
        p_subject: owner.subject,
        p_client_id: config.clientId,
        p_encrypted_token: encrypted,
      });
      if (error) throw new Error('Apple credential could not be saved.');
    },
  }),
);
