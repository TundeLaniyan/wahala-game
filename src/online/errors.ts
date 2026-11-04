/**
 * Error model shared by the services and the wire protocol. A discriminated union on `code`.
 */

/** Why a message was rejected by a validator (client UX and, identically, the server). */
export interface ValidationError {
  code: 'malformed' | 'invalid' | 'unknownType' | 'unknownField' | 'forbiddenField' | 'tooLarge' | 'versionMismatch';
  /** JSON-path-like location, e.g. `intent.vehicle.entry.x`. */
  path: string;
  message: string;
}

export type OnlineError =
  | { code: 'unauthenticated'; message: string }
  | { code: 'forbidden'; message: string }
  | { code: 'notFound'; message: string }
  | { code: 'conflict'; message: string }
  | { code: 'roomFull'; message: string }
  | { code: 'invalidMessage'; message: string; issues: ValidationError[] }
  | { code: 'invalidState'; message: string; state: string }
  | { code: 'rateLimited'; message: string; retryAfterMs: number }
  | { code: 'versionMismatch'; message: string; clientVersion: number; serverVersion: number }
  | { code: 'serverUnavailable'; message: string }
  | { code: 'timeout'; message: string }
  | { code: 'reconnectExpired'; message: string }
  | { code: 'internal'; message: string };

export type OnlineErrorCode = OnlineError['code'];

export const ONLINE_ERROR_CODES: readonly OnlineErrorCode[] = [
  'unauthenticated',
  'forbidden',
  'notFound',
  'conflict',
  'roomFull',
  'invalidMessage',
  'invalidState',
  'rateLimited',
  'versionMismatch',
  'serverUnavailable',
  'timeout',
  'reconnectExpired',
  'internal',
];

/** Convenience constructors (so call sites stay one line). */
export const E = {
  unauthenticated: (message = 'Sign in first.'): OnlineError => ({ code: 'unauthenticated', message }),
  forbidden: (message = 'Not allowed.'): OnlineError => ({ code: 'forbidden', message }),
  notFound: (message = 'Not found.'): OnlineError => ({ code: 'notFound', message }),
  conflict: (message: string): OnlineError => ({ code: 'conflict', message }),
  roomFull: (message = 'The room is full.'): OnlineError => ({ code: 'roomFull', message }),
  invalid: (issues: ValidationError[], message = 'Invalid message.'): OnlineError => ({
    code: 'invalidMessage',
    message,
    issues,
  }),
  invalidState: (state: string, message: string): OnlineError => ({ code: 'invalidState', message, state }),
  rateLimited: (retryAfterMs: number): OnlineError => ({
    code: 'rateLimited',
    message: 'Too many requests.',
    retryAfterMs,
  }),
  versionMismatch: (clientVersion: number, serverVersion: number): OnlineError => ({
    code: 'versionMismatch',
    message: 'Protocol version mismatch.',
    clientVersion,
    serverVersion,
  }),
  serverUnavailable: (message = 'The server is not available.'): OnlineError => ({
    code: 'serverUnavailable',
    message,
  }),
  timeout: (message = 'The request timed out.'): OnlineError => ({ code: 'timeout', message }),
  reconnectExpired: (message = 'The reconnect window has closed.'): OnlineError => ({
    code: 'reconnectExpired',
    message,
  }),
  internal: (message = 'Unexpected error.'): OnlineError => ({ code: 'internal', message }),
};

/** A short line for the UI (never includes tokens or internals). */
export function describeError(e: OnlineError): string {
  switch (e.code) {
    case 'unauthenticated':
      return 'Please sign in first.';
    case 'roomFull':
      return 'That room is full.';
    case 'rateLimited':
      return 'Slow down a little.';
    case 'serverUnavailable':
      return 'The (mock) server is not available right now.';
    case 'timeout':
      return 'The (mock) server took too long to answer.';
    case 'reconnectExpired':
      return 'The reconnect window has closed.';
    default:
      return e.message;
  }
}
