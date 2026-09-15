import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import { createDispatchHandler, type PushJob } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Supabase worker credentials are missing.');
const publicKey = Deno.env.get('DWD_VAPID_PUBLIC_KEY');
const privateKey = Deno.env.get('DWD_VAPID_PRIVATE_KEY');
const subject = Deno.env.get('DWD_VAPID_SUBJECT');
const configured = !!(publicKey && privateKey && subject);
if (configured) webpush.setVapidDetails(subject!, publicKey!, privateKey!);
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  createDispatchHandler({
    secret: Deno.env.get('DWD_PUSH_DISPATCH_SECRET'),
    configured,
    async claim() {
      const { data, error } = await supabase.rpc('claim_notification_jobs', { p_limit: 10 });
      if (error) throw error;
      return (data ?? []) as PushJob[];
    },
    async complete(job, delivered, permanent, errorMessage) {
      const { data, error } = await supabase.rpc('complete_notification_job', {
        p_delivery_id: job.deliveryId,
        p_attempt: job.attempt,
        p_delivered: delivered,
        p_permanent_failure: permanent,
        p_error: errorMessage,
      });
      if (error || data?.updated !== true) throw new Error('Delivery acknowledgement failed.');
    },
    async send(job) {
      await webpush.sendNotification(
        { endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } },
        JSON.stringify({
          title: 'DWD notification',
          body: job.body,
          url: job.url,
          eventId: job.eventId,
          tag: `dwd-${job.eventId}`,
        }),
        { timeout: 10_000, TTL: 120 },
      );
    },
  }),
);
