import { deepStrictEqual, equal } from 'node:assert/strict';
import { createDispatchHandler, supportedPushEndpoint, type PushJob } from './handler.ts';

const job: PushJob = {
  deliveryId: 'delivery',
  eventId: 'event',
  attempt: 2,
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
  p256dh: 'fixture',
  auth: 'fixture',
  body: 'Update',
  url: '/account',
};
const request = () =>
  new Request('https://worker.example.test', {
    method: 'POST',
    headers: { 'x-dwd-dispatch-secret': 'fixture-secret' },
  });

Deno.test('dispatch rejects missing auth without claiming jobs', async () => {
  let claims = 0;
  const handler = createDispatchHandler({
    secret: 'fixture-secret',
    configured: true,
    claim: () => {
      claims++;
      return Promise.resolve([]);
    },
    complete: async () => {},
    send: async () => {},
  });
  equal((await handler(new Request('https://worker.example.test'))).status, 401);
  equal(claims, 0);
});
Deno.test('dispatch acknowledges success with the original attempt token', async () => {
  const completions: unknown[] = [];
  const handler = createDispatchHandler({
    secret: 'fixture-secret',
    configured: true,
    claim: () => Promise.resolve([job]),
    send: async () => {},
    complete: (claimed, delivered, permanent, error) => {
      completions.push([claimed.attempt, delivered, permanent, error]);
      return Promise.resolve();
    },
  });
  equal((await handler(request())).status, 200);
  deepStrictEqual(completions, [[2, true, false, null]]);
});
Deno.test('completion failure reports a failed dispatch for lease recovery', async () => {
  const handler = createDispatchHandler({
    secret: 'fixture-secret',
    configured: true,
    claim: () => Promise.resolve([job]),
    send: async () => {},
    complete: () => Promise.reject(new Error('database offline')),
  });
  equal((await handler(request())).status, 500);
});
Deno.test(
  'expired endpoints become permanent failures without storing response secrets',
  async () => {
    let result: unknown;
    const handler = createDispatchHandler({
      secret: 'fixture-secret',
      configured: true,
      claim: () => Promise.resolve([job]),
      send: () => Promise.reject({ statusCode: 410, body: 'SECRET ENDPOINT' }),
      complete: (_job, delivered, permanent, error) => {
        result = [delivered, permanent, error];
        return Promise.resolve();
      },
    });
    equal((await handler(request())).status, 200);
    deepStrictEqual(result, [false, true, 'Push endpoint is unavailable.']);
  },
);
Deno.test('push transport cannot request arbitrary or local services', () => {
  for (const endpoint of [
    'https://127.0.0.1/push',
    'https://example.test/push',
    'https://fcm.googleapis.com.evil.test/push',
    'https://user:pass@fcm.googleapis.com/push',
    'https://fcm.googleapis.com:444/push',
  ])
    equal(supportedPushEndpoint(endpoint), false);
  equal(supportedPushEndpoint(job.endpoint), true);
  equal(supportedPushEndpoint('https://web.push.apple.com/fixture'), true);
  equal(supportedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/fixture'), true);
});
