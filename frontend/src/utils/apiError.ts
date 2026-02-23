import { isAxiosError } from 'axios';

/**
 * Extracts a human-readable error message from an API error.
 * Prefers the server-returned `error` field so that messages like
 * "Insufficient permissions" or "No access to this connection" are
 * surfaced directly to the user instead of a generic fallback.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    const msg = data?.error ?? data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}
