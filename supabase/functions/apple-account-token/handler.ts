export interface AppleTokenOwner {
  userId: string;
  subject: string;
}
export function createAppleTokenHandler(deps: {
  ready: () => Promise<void>;
  authenticate: (token: string) => Promise<AppleTokenOwner | null>;
  capture: (owner: AppleTokenOwner, code: string) => Promise<void>;
}) {
  const reply = (status: number, ok = false) =>
    Response.json(
      { ok },
      {
        status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  return async (request: Request) => {
    if (!['GET', 'POST'].includes(request.method)) return reply(405);
    try {
      await deps.ready();
    } catch {
      return reply(503);
    }
    if (request.method === 'GET') return reply(200, true);
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply(401);
    let owner: AppleTokenOwner | null;
    try {
      owner = await deps.authenticate(token);
    } catch {
      return reply(401);
    }
    if (!owner) return reply(401);
    let code: string;
    try {
      if (!request.headers.get('Content-Type')?.startsWith('application/json') || !request.body)
        return reply(400);
      const reader = request.body.getReader();
      const decoder = new TextDecoder();
      let length = 0;
      let text = '';
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        length += result.value.byteLength;
        if (length > 8192) {
          await reader.cancel();
          return reply(413);
        }
        text += decoder.decode(result.value, { stream: true });
      }
      const body: unknown = JSON.parse(text + decoder.decode());
      if (
        !body ||
        typeof body !== 'object' ||
        !('authorizationCode' in body) ||
        typeof body.authorizationCode !== 'string' ||
        !body.authorizationCode ||
        body.authorizationCode.length > 4096
      )
        return reply(400);
      code = body.authorizationCode;
    } catch {
      return reply(400);
    }
    try {
      await deps.capture(owner, code);
      return reply(200, true);
    } catch {
      return reply(503);
    }
  };
}
