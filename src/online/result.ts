/**
 * The error channel of every online service: a `Result` value, never an exception across the boundary.
 */
import type { OnlineError } from './errors';

export type Result<T, E = OnlineError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Unwraps or throws (tests only; application code branches on `ok`). */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`unwrap of an error result: ${JSON.stringify(r.error)}`);
}
