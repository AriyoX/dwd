export interface DeletionJob {
  userId: string;
  requestId: string;
  claimId: string;
  objectPaths: string[];
}

export function createDeletionHandler(deps: {
  secret: string | undefined;
  claim: () => Promise<DeletionJob[]>;
  revokeApple: (job: DeletionJob) => Promise<void>;
  removePhotos: (paths: string[]) => Promise<void>;
  complete: (job: DeletionJob) => Promise<boolean>;
}) {
  return async (request: Request): Promise<Response> => {
    if (
      !deps.secret ||
      deps.secret.length < 32 ||
      request.headers.get('x-dwd-deletion-secret') !== deps.secret
    ) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    let deleted = 0;
    let failed = 0;
    try {
      const jobs = await deps.claim();
      for (const job of jobs) {
        try {
          // Provider revocation must finish before any irreversible account/photo cleanup.
          await deps.revokeApple(job);
          // Remove actual objects through the Storage API before deleting metadata/Auth.
          // A failed job remains processing and can be reclaimed after its lease expires.
          for (let index = 0; index < job.objectPaths.length; index += 100) {
            await deps.removePhotos(job.objectPaths.slice(index, index + 100));
          }
          if (await deps.complete(job)) deleted++;
          else failed++;
        } catch {
          failed++;
        }
      }
      return Response.json({ deleted, failed }, { status: failed > 0 ? 503 : 200 });
    } catch {
      return Response.json({ error: 'Account deletion worker failed.' }, { status: 503 });
    }
  };
}
