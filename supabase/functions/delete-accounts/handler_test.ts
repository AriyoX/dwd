import { deepStrictEqual, equal } from 'node:assert/strict';
import { createDeletionHandler, type DeletionJob } from './handler.ts';

const secret = 'local-test-deletion-secret-32-characters';
const job: DeletionJob = {
  userId: 'user',
  requestId: 'request',
  claimId: 'claim',
  objectPaths: ['one.jpg', 'two.jpg'],
};
const request = () =>
  new Request('https://worker.example.test', {
    method: 'POST',
    headers: { 'x-dwd-deletion-secret': secret },
  });

Deno.test('unauthorized requests never claim jobs', async () => {
  let claimed = false;
  const handler = createDeletionHandler({
    secret,
    claim: async () => {
      claimed = true;
      return [];
    },
    removePhotos: async () => {},
    complete: async () => true,
  });
  equal((await handler(new Request('https://worker.example.test'))).status, 401);
  equal(claimed, false);
});

Deno.test('photos are removed before account deletion with the same claim token', async () => {
  const steps: unknown[] = [];
  const handler = createDeletionHandler({
    secret,
    claim: async () => [job],
    removePhotos: async (paths) => {
      steps.push(paths);
    },
    complete: async (received) => {
      steps.push(received);
      return true;
    },
  });
  equal((await handler(request())).status, 200);
  deepStrictEqual(steps, [job.objectPaths, job]);
});

Deno.test('a Storage failure retains the account for retry and continues other jobs', async () => {
  const completed: string[] = [];
  const handler = createDeletionHandler({
    secret,
    claim: async () => [job, { ...job, userId: 'other', objectPaths: [] }],
    removePhotos: async () => {
      throw new Error('Offline');
    },
    complete: async (received) => {
      completed.push(received.userId);
      return true;
    },
  });
  const response = await handler(request());
  equal(response.status, 503);
  deepStrictEqual(await response.json(), { deleted: 1, failed: 1 });
  deepStrictEqual(completed, ['other']);
});

Deno.test('stale claim acknowledgement is reported as a failed deletion', async () => {
  const handler = createDeletionHandler({
    secret,
    claim: async () => [{ ...job, objectPaths: [] }],
    removePhotos: async () => {},
    complete: async () => false,
  });
  equal((await handler(request())).status, 503);
});
