import type { NextRequest } from 'next/server';
import { GET as respond } from '@/app/api/events/the-link-up/[...path]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Reuse every existing operation and its per-request organizer guard.
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return respond(request, { params: Promise.resolve({ path: ['admin', ...path] }) });
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
