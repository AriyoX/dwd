export interface NativePushJob {
  deliveryId: string;
  attempt: number;
  token: string;
  eventId: string;
  recipientUserId: string;
  nightId: string | null;
}
type ExpoResult = { status?: string; id?: string; details?: { error?: string } };
export function nativePushMessage(job: NativePushJob) {
  return {
    to: job.token,
    title: 'Drink with Desire',
    body: 'You have a new notification. Open DWD to view it.',
    sound: 'default',
    channelId: 'dwd-reminders',
    ttl: 120,
    data: { eventId: job.eventId, recipientUserId: job.recipientUserId, nightId: job.nightId },
  };
}
export function createNativeDispatcher(deps: {
  claim: () => Promise<NativePushJob[]>;
  complete: (job: NativePushJob, receipt: string | null, permanent: boolean) => Promise<void>;
  receipts: () => Promise<{ deliveryId: string; receiptId: string }[]>;
  completeReceipt: (deliveryId: string, unregistered: boolean, delivered: boolean) => Promise<void>;
  accessToken?: string;
  fetch: typeof fetch;
}) {
  async function post(path: string, body: unknown) {
    const response = await deps.fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(deps.accessToken ? { Authorization: `Bearer ${deps.accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Expo push service unavailable.');
    return (await response.json()) as { data?: ExpoResult | Record<string, ExpoResult> };
  }
  return async () => {
    let receiptsPending = false;
    try {
      const receipts = await deps.receipts();
      if (receipts.length) {
        const result = await post('getReceipts', { ids: receipts.map((r) => r.receiptId) });
        const data = result.data as Record<string, ExpoResult> | undefined;
        for (const receipt of receipts) {
          const status = data?.[receipt.receiptId];
          if (status?.status)
            await deps.completeReceipt(
              receipt.deliveryId,
              status.details?.error === 'DeviceNotRegistered',
              status.status === 'ok',
            );
        }
      }
    } catch {
      // A receipt outage must not block new notifications. Retry receipts next pass.
      receiptsPending = true;
    }
    const jobs = await deps.claim();
    let accepted = 0;
    for (let index = 0; index < jobs.length; index += 5) {
      await Promise.all(
        jobs.slice(index, index + 5).map(async (job) => {
          let receipt: string | null = null;
          let permanent = false;
          try {
            const result = await post('send', nativePushMessage(job));
            const ticket = result.data as ExpoResult | undefined;
            if (ticket?.status === 'ok' && typeof ticket.id === 'string') receipt = ticket.id;
            permanent = ticket?.details?.error === 'DeviceNotRegistered';
          } catch {
            /* Retain a bounded retry; never persist response bodies or device tokens. */
          }
          await deps.complete(job, receipt, permanent);
          if (receipt) accepted++;
        }),
      );
    }
    return { claimed: jobs.length, accepted, receiptsPending };
  };
}
