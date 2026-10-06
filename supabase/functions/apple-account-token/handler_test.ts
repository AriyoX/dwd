import { equal, deepStrictEqual } from 'node:assert/strict';
import { createAppleTokenHandler } from './handler.ts';
const owner = { userId: 'account', subject: 'apple-subject' };
const request = (body: unknown, token = 'valid') =>
  new Request('https://function.example.test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
Deno.test('an unconfigured service refuses readiness without receiving credentials', async () => {
  let called = false;
  const handler = createAppleTokenHandler({
    ready: async () => {
      throw new Error('private config');
    },
    authenticate: async () => {
      called = true;
      return owner;
    },
    capture: async () => {
      called = true;
    },
  });
  const response = await handler(new Request('https://function.example.test'));
  equal(response.status, 503);
  deepStrictEqual(await response.json(), { ok: false });
  equal(called, false);
});
Deno.test(
  'only the verified current Apple account owns a captured authorization code',
  async () => {
    const received: unknown[] = [];
    const handler = createAppleTokenHandler({
      ready: async () => {},
      authenticate: async (token) => (token === 'valid' ? owner : null),
      capture: async (...args) => {
        received.push(args);
      },
    });
    equal(
      (await handler(request({ authorizationCode: 'one-use-code', userId: 'attacker' }))).status,
      200,
    );
    deepStrictEqual(received, [[owner, 'one-use-code']]);
    equal((await handler(request({ authorizationCode: 'code' }, 'expired'))).status, 401);
    equal(received.length, 1);
  },
);
Deno.test('oversized, malformed or missing code requests never reach Apple', async () => {
  let calls = 0;
  const handler = createAppleTokenHandler({
    ready: async () => {},
    authenticate: async () => owner,
    capture: async () => {
      calls++;
    },
  });
  equal((await handler(request({ authorizationCode: 'x'.repeat(9000) }))).status, 413);
  equal((await handler(request({ authorizationCode: '' }))).status, 400);
  equal((await handler(request({ userId: 'account' }))).status, 400);
  equal(calls, 0);
});
Deno.test('exchange/storage errors return no provider code or secret detail', async () => {
  const handler = createAppleTokenHandler({
    ready: async () => {},
    authenticate: async () => owner,
    capture: async () => {
      throw new Error('private token');
    },
  });
  const response = await handler(request({ authorizationCode: 'code' }));
  equal(response.status, 503);
  deepStrictEqual(await response.json(), { ok: false });
});
