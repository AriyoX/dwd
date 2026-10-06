import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import { createDispatchHandler, createPushPayload, type PushJob } from './handler.ts';
import { createNativeDispatcher, type NativePushJob } from './native.ts';

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

const browserDispatch = createDispatchHandler({
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
      JSON.stringify(createPushPayload(job)),
      { timeout: 10_000, TTL: 120 },
    );
  },
});

const nativeDispatch = createNativeDispatcher({
  fetch,
  accessToken: Deno.env.get('DWD_EXPO_ACCESS_TOKEN'),
  async recheck(job) {
    const { data, error } = await supabase.rpc('recheck_native_notification_job', {
      p_delivery_id: job.deliveryId,
      p_attempt: job.attempt,
    });
    if (error) throw error;
    return data === true;
  },
  async claim() {
    const { data, error } = await supabase.rpc('claim_native_notification_jobs', { p_limit: 10 });
    if (error) throw error;
    return (data ?? []) as NativePushJob[];
  },
  async complete(job, receipt, permanent) {
    const { data, error } = await supabase.rpc('complete_native_notification_job', {
      p_delivery_id: job.deliveryId,
      p_attempt: job.attempt,
      p_receipt_id: receipt,
      p_permanent_failure: permanent,
    });
    if (error || data?.updated !== true) throw new Error('Native delivery acknowledgement failed.');
  },
  async receipts() {
    const { data, error } = await supabase.rpc('get_native_push_receipts');
    if (error) throw error;
    return (data ?? []) as { deliveryId: string; receiptId: string }[];
  },
  async completeReceipt(deliveryId, unregistered, delivered) {
    const { error } = await supabase.rpc('complete_native_push_receipt', {
      p_delivery_id: deliveryId,
      p_device_unregistered: unregistered,
      p_delivered: delivered,
    });
    if (error) throw error;
  },
});
Deno.serve(async (request) => {
  const secret = Deno.env.get('DWD_PUSH_DISPATCH_SECRET');
  if (!secret || request.headers.get('x-dwd-dispatch-secret') !== secret)
    return new Response('Unauthorized', { status: 401 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const results = await Promise.allSettled([
    configured ? browserDispatch(request) : Promise.resolve(null),
    nativeDispatch(),
  ]);
  const browser = results[0].status === 'fulfilled' ? results[0].value : null;
  const native = results[1];
  return Response.json(
    {
      ok: native.status === 'fulfilled' && (!configured || browser?.ok === true),
      browser: browser ? await browser.json() : { configured: false },
      native:
        native.status === 'fulfilled'
          ? native.value
          : { error: 'Native dispatch did not complete.' },
    },
    { status: native.status === 'fulfilled' && (!configured || browser?.ok === true) ? 200 : 500 },
  );
});
