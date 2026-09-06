import type { Json } from '@dwd/core';

export class DataAccessError extends Error {
  public readonly code: string | undefined;

  public constructor(message: string, code?: string) {
    super(message);
    this.name = 'DataAccessError';
    this.code = code;
  }
}

export function unwrapRpc<T>(
  data: Json | T | null,
  error: { message: string; code?: string } | null,
): T {
  if (error !== null) throw new DataAccessError(error.message, error.code);
  if (data === null) throw new DataAccessError('The server returned no data.');
  return data as T;
}

export function toJson(value: unknown): Json {
  return value as Json;
}
