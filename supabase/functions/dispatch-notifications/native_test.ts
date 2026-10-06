import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { createNativeDispatcher, nativePushMessage, type NativePushJob } from './native.ts';
const job: NativePushJob = {
  deliveryId: 'delivery',
  attempt: 1,
  token: 'ExpoPushToken[fixture]',
  eventId: 'event',
  recipientUserId: 'owner',
  nightId: 'night',
};
function fixture(result: unknown, status = 200) {
  const completed: unknown[][] = [];
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const deps = {
    claim: () => Promise.resolve([job]),
    complete: (j: NativePushJob, receipt: string | null, permanent: boolean) => {
      completed.push([j.deliveryId, receipt, permanent]);
      return Promise.resolve();
    },
    receipts: () => Promise.resolve([] as { deliveryId: string; receiptId: string }[]),
    completeReceipt: (_id: string, _unregistered: boolean, _delivered: boolean) =>
      Promise.resolve(),
    fetch: ((_url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(_url), init });
      return Promise.resolve(Response.json(result, { status }));
    }) as typeof fetch,
  };
  return { deps, requests, completed };
}
Deno.test(
  'native payload has a canonical account/event reference and generic lock-screen copy',
  () => {
    const message = nativePushMessage(job);
    deepStrictEqual(message.data, { eventId: 'event', recipientUserId: 'owner', nightId: 'night' });
    equal(message.to, job.token);
    equal(message.ttl, 120);
    equal(message.channelId, 'dwd-reminders');
    ok(!JSON.stringify(message).includes('Private check-in'));
  },
);
Deno.test('accepted Expo ticket is recorded with the original attempt', async () => {
  const f = fixture({ data: { status: 'ok', id: 'ticket' } });
  deepStrictEqual(await createNativeDispatcher(f.deps)(), {
    claimed: 1,
    accepted: 1,
    receiptsPending: false,
  });
  deepStrictEqual(f.completed, [['delivery', 'ticket', false]]);
  equal(f.requests[0]?.url, 'https://exp.host/--/api/v2/push/send');
  ok(f.requests[0]?.init?.signal);
});
Deno.test('pre-plot pushes use the campaign copy and expire with the window', () => {
  const message = nativePushMessage({
    ...job,
    preplot: true,
    title: 'Ofuluma leero? 👀',
    body: 'Set up your Night before you head out.',
    expiresAt: '2026-10-09T13:00:00Z',
  });
  equal(message.title, 'Ofuluma leero? 👀');
  equal(message.body, 'Set up your Night before you head out.');
  equal(message.expiration, Date.parse('2026-10-09T13:00:00Z') / 1000);
});
Deno.test('a Night starting after claim suppresses the send', async () => {
  const f = fixture({ data: { status: 'ok', id: 'ticket' } });
  const result = await createNativeDispatcher({
    ...f.deps,
    recheck: () => Promise.resolve(false),
  })();
  equal(result.accepted, 0);
  equal(f.requests.length, 0);
  equal(f.completed.length, 0);
});
Deno.test('a failed eligibility recheck never sends to Expo', async () => {
  const f = fixture({ data: { status: 'ok', id: 'ticket' } });
  await createNativeDispatcher({
    ...f.deps,
    recheck: () => Promise.reject(new Error('offline')),
  })();
  equal(f.requests.length, 0);
  deepStrictEqual(f.completed, [['delivery', null, false]]);
});
Deno.test('DeviceNotRegistered is permanent without saving remote error text', async () => {
  const f = fixture({
    data: {
      status: 'error',
      message: 'secret endpoint text',
      details: { error: 'DeviceNotRegistered' },
    },
  });
  await createNativeDispatcher(f.deps)();
  deepStrictEqual(f.completed, [['delivery', null, true]]);
});
Deno.test(
  'rate limits and temporary credential/service errors retain bounded retries',
  async () => {
    for (const response of [
      { data: { status: 'error', details: { error: 'InvalidCredentials' } } },
      { data: { status: 'ok' } },
    ]) {
      const f = fixture(response);
      await createNativeDispatcher(f.deps)();
      deepStrictEqual(f.completed, [['delivery', null, false]]);
    }
    const f = fixture({ error: 'limit' }, 429);
    await createNativeDispatcher(f.deps)();
    deepStrictEqual(f.completed, [['delivery', null, false]]);
  },
);
Deno.test('push receipts distinguish delivery and stale-device rejection', async () => {
  const f = fixture({
    data: { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } },
  });
  f.deps.claim = () => Promise.resolve([]);
  f.deps.receipts = () => Promise.resolve([{ deliveryId: 'delivery', receiptId: 'ticket' }]);
  const completed: unknown[][] = [];
  f.deps.completeReceipt = (id, unregistered, delivered) => {
    completed.push([id, unregistered, delivered]);
    return Promise.resolve();
  };
  await createNativeDispatcher(f.deps)();
  deepStrictEqual(completed, [['delivery', true, false]]);
  equal(f.requests[0]?.url, 'https://exp.host/--/api/v2/push/getReceipts');
});
Deno.test('missing receipts remain pending for a later polling pass', async () => {
  const f = fixture({ data: {} });
  f.deps.claim = () => Promise.resolve([]);
  f.deps.receipts = () => Promise.resolve([{ deliveryId: 'delivery', receiptId: 'ticket' }]);
  let completions = 0;
  f.deps.completeReceipt = () => {
    completions++;
    return Promise.resolve();
  };
  await createNativeDispatcher(f.deps)();
  equal(completions, 0);
});
Deno.test('optional Expo access token stays in request headers', async () => {
  const f = fixture({ data: { status: 'ok', id: 'ticket' } });
  await createNativeDispatcher({ ...f.deps, accessToken: 'worker-secret' })();
  equal(new Headers(f.requests[0]?.init?.headers).get('Authorization'), 'Bearer worker-secret');
  ok(!String(f.requests[0]?.init?.body).includes('worker-secret'));
});
Deno.test('receipt-service failures do not block new notification delivery', async () => {
  const f = fixture({ data: { status: 'ok', id: 'ticket' } });
  f.deps.receipts = () => Promise.resolve([{ deliveryId: 'previous', receiptId: 'old-ticket' }]);
  const send = f.deps.fetch;
  f.deps.fetch = (url, init) =>
    String(url).endsWith('getReceipts')
      ? Promise.reject(new Error('Receipt service unavailable'))
      : send(url, init);
  deepStrictEqual(await createNativeDispatcher(f.deps)(), {
    claimed: 1,
    accepted: 1,
    receiptsPending: true,
  });
  deepStrictEqual(f.completed, [['delivery', 'ticket', false]]);
});
