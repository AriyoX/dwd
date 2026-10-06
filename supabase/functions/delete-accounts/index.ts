import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { createDeletionHandler, type DeletionJob } from './handler.ts';
import { appleConfig, decryptAppleToken, revokeAppleToken } from '../_shared/apple.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Supabase worker credentials are missing.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(
  createDeletionHandler({
    secret: Deno.env.get('DWD_ACCOUNT_DELETION_SECRET'),
    async claim() {
      const { data, error } = await client.rpc('claim_account_deletions', { p_limit: 10 });
      if (error) throw error;
      return (data ?? []) as DeletionJob[];
    },
    async removePhotos(paths) {
      const { error } = await client.storage.from('night-memories').remove(paths);
      if (error) throw error;
    },
    async revokeApple(job) {
      const args = { p_user_id: job.userId, p_request_id: job.requestId, p_claim_id: job.claimId };
      const { data, error } = await client.rpc('get_apple_deletion_token', args);
      if (error) throw error;
      if (data === null) return;
      if (
        typeof data !== 'object' ||
        typeof data.encryptedToken !== 'string' ||
        typeof data.clientId !== 'string'
      )
        throw new Error('Apple deletion credential unavailable.');
      const config = appleConfig((name) => Deno.env.get(name));
      if (config.clientId !== data.clientId) throw new Error('Apple app identity mismatch.');
      await revokeAppleToken(
        config,
        await decryptAppleToken(config, job.userId, data.encryptedToken),
      );
      const result = await client.rpc('mark_apple_authorization_revoked', args);
      if (result.error || result.data !== true)
        throw new Error('Apple revocation acknowledgement failed.');
    },
    async complete(job) {
      const { data, error } = await client.rpc('complete_account_deletion', {
        p_user_id: job.userId,
        p_request_id: job.requestId,
        p_claim_id: job.claimId,
      });
      if (error) throw error;
      return data === true;
    },
  }),
);
