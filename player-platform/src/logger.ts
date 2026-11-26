/**
 * Structured (one JSON object per line) logging that cannot leak secrets: field NAMES that look sensitive are replaced,
 * and string VALUES that look like a token, a JWT or an Authorization header are scrubbed even under an innocent name.
 * Player identifiers are logged as ids (uuid), never names, e-mails or addresses.
 */
export type Level = 'debug' | 'info' | 'warn' | 'error';
export type LogSink = (line: string) => void;

const SENSITIVE_KEY =
  /(token|secret|password|passwd|authorization|cookie|credential|assertion|signature|private|apikey|api_key|refresh|idtoken|id_token|bearer|nonce|email|ip$|^ip|invite|friendcode|partycode|roomcode|^code$)/i;
const TOKEN_VALUE =
  /\b(w[ar]_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*|Bearer\s+\S+)/g;

export const REDACTED = '[redacted]';

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (typeof value === 'string') return value.replace(TOKEN_VALUE, REDACTED).slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : scrub(v, depth + 1);
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(
  sink: LogSink = (l) => process.stdout.write(`${l}\n`),
  min: Level = 'info',
  now: () => Date = () => new Date(),
): Logger {
  const emit = (level: Level, msg: string, fields?: Record<string, unknown>): void => {
    if (ORDER[level] < ORDER[min]) return;
    sink(
      JSON.stringify({
        t: now().toISOString(),
        level,
        msg: scrub(msg),
        ...(fields ? (scrub(fields) as Record<string, unknown>) : {}),
      }),
    );
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
