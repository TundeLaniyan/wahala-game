/**
 * HTTPS command transport of the server adapter (SKELETON: never run against a real back end in this repository).
 * Maps HTTP status codes to the shared `OnlineError` union and never throws. The bearer token is read from memory
 * for each request and is never logged, stored or put in a URL.
 */
import { E } from '../errors';
import type { OnlineError } from '../errors';
import { err, ok } from '../result';
import type { Result } from '../result';
import { PROTOCOL_VERSION } from '../schema';
import type { AuthToken } from '../types';

export interface HttpDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface Http {
  post(path: string, body?: unknown): Promise<Result<unknown>>;
}

/** Status code -> error. Anything unexpected is `internal`; connectivity problems are `serverUnavailable`. */
export function errorFromStatus(status: number, retryAfterSec?: number): OnlineError {
  if (status === 400 || status === 422)
    return E.invalid([{ code: 'invalid', path: '', message: 'rejected by the server' }]);
  if (status === 401) return E.unauthenticated();
  if (status === 403) return E.forbidden();
  if (status === 404) return E.notFound();
  if (status === 409) return E.conflict('Conflicts with the current state.');
  if (status === 426) return E.versionMismatch(PROTOCOL_VERSION, 0);
  if (status === 429) return E.rateLimited(Math.max(0, Math.round((retryAfterSec ?? 1) * 1000)));
  if (status >= 500) return E.serverUnavailable();
  return E.internal(`Unexpected status ${status}.`);
}

export function createHttp(baseUrl: string, token: () => AuthToken | null, deps: HttpDeps = {}): Http {
  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = deps.timeoutMs ?? 10_000;
  return {
    async post(path, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'x-wahala-protocol': String(PROTOCOL_VERSION),
        };
        const t = token();
        if (t) headers.authorization = `Bearer ${t.reveal()}`;
        const res = await doFetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body ?? {}),
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
        });
        if (!res.ok)
          return err(errorFromStatus(res.status, Number(res.headers.get('retry-after')) || undefined));
        const text = await res.text();
        if (text.length > 1_000_000) return err(E.internal('Response too large.'));
        return ok(text ? (JSON.parse(text) as unknown) : null);
      } catch (e) {
        return err(
          (e as { name?: string } | null)?.name === 'AbortError' ? E.timeout() : E.serverUnavailable(),
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
