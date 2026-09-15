export interface PushJob {
  deliveryId: string;
  eventId: string;
  attempt: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  body: string;
  url: string;
}

export function supportedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      (url.port === '' || url.port === '443') &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname.endsWith('.push.apple.com') ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}

export function createDispatchHandler(deps: {
  secret: string | undefined;
  configured: boolean;
  claim: () => Promise<PushJob[]>;
  complete: (
    job: PushJob,
    delivered: boolean,
    permanent: boolean,
    error: string | null,
  ) => Promise<void>;
  send: (job: PushJob) => Promise<void>;
}) {
  return async (request: Request) => {
    if (!deps.secret || request.headers.get('x-dwd-dispatch-secret') !== deps.secret)
      return new Response('Unauthorized', { status: 401 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!deps.configured)
      return Response.json(
        { ok: false, error: 'Push signing is not configured.' },
        { status: 503 },
      );
    let delivered = 0;
    let failed = 0;
    try {
      const jobs = await deps.claim();
      // Ten jobs, five at a time; the transport bounds each send to ten seconds.
      for (let index = 0; index < jobs.length; index += 5) {
        await Promise.all(
          jobs.slice(index, index + 5).map(async (job) => {
            let permanent = false;
            let error: string | null = null;
            try {
              if (!supportedPushEndpoint(job.endpoint)) {
                permanent = true;
                throw new Error('Unsupported push service endpoint.');
              }
              await deps.send(job);
            } catch (deliveryError) {
              const status =
                typeof deliveryError === 'object' &&
                deliveryError !== null &&
                'statusCode' in deliveryError
                  ? Number(deliveryError.statusCode)
                  : 0;
              permanent ||= status === 404 || status === 410;
              // HTTP bodies/URLs may contain subscription secrets.
              error = permanent ? 'Push endpoint is unavailable.' : 'Push delivery failed.';
            }
            await deps.complete(job, error === null, permanent, error);
            if (error === null) delivered += 1;
            else failed += 1;
          }),
        );
      }
      return Response.json({ ok: true, claimed: jobs.length, delivered, failed });
    } catch {
      return Response.json(
        { ok: false, error: 'Notification dispatch did not complete.' },
        { status: 500 },
      );
    }
  };
}
