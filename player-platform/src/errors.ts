/** One error type for everything a client can be told. The HTTP layer renders it as `{ error: { code, message, requestId } }`. */
export type ErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'name_taken'
  | 'name_rejected'
  | 'rate_limited'
  | 'reauth_required'
  | 'provider_not_configured'
  | 'provider_rejected'
  | 'payload_too_large'
  | 'restricted_account'
  | 'unavailable'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  reauth_required: 401,
  forbidden: 403,
  restricted_account: 403,
  not_found: 404,
  conflict: 409,
  name_taken: 409,
  name_rejected: 422,
  payload_too_large: 413,
  rate_limited: 429,
  provider_rejected: 401,
  provider_not_configured: 501,
  unavailable: 503,
  internal: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: { retryAfterMs?: number; details?: unknown } = {},
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const badRequest = (m: string, details?: unknown): ApiError =>
  new ApiError('bad_request', m, { details });
export const notFound = (m = 'not found'): ApiError => new ApiError('not_found', m);
export const forbidden = (m = 'not allowed'): ApiError => new ApiError('forbidden', m);
export const conflict = (m: string): ApiError => new ApiError('conflict', m);
