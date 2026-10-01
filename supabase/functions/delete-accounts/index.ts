import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { createDeletionHandler, type DeletionJob } from './handler.ts';

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
