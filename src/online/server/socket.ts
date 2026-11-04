/**
 * The streaming transport of the server adapter (SKELETON): a socket behind a small interface, JSON text frames
 * decoded through `schema.ts`, and reconnection with exponential backoff and jitter. The browser's socket
 * constructor is referenced in exactly one line (`browserSocket`), and this whole directory is unreachable from a
 * default build (tests/platform-static.test.ts and scripts/check-static-build.mjs).
 */

export interface SocketLike {
  send(text: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((text: string) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

/** The real browser socket. The single place the platform constructor is named. */
export const browserSocket: SocketFactory = (url) => {
  const ws = new WebSocket(url);
  const like: SocketLike = {
    send: (t) => ws.send(t),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  ws.onopen = () => like.onopen?.();
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') like.onmessage?.(e.data);
  };
  ws.onclose = () => like.onclose?.();
  ws.onerror = () => like.onerror?.();
  return like;
};

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** 0..1 fraction of the delay that is randomised. */
  jitter: number;
}
export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 15_000, jitter: 0.3 };

/** Delay before reconnect attempt `attempt` (0-based): exponential, capped, with jitter. Pure given `random`. */
export function backoffDelay(
  attempt: number,
  random: () => number,
  o: BackoffOptions = DEFAULT_BACKOFF,
): number {
  const exp = Math.min(o.maxMs, o.baseMs * 2 ** Math.max(0, attempt));
  return Math.round(exp * (1 - o.jitter + o.jitter * random()));
}

export interface ManagedSocketDeps {
  factory?: SocketFactory;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  backoff?: BackoffOptions;
}

export type SocketState = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** A socket that reconnects by itself until `close()`. `onOpen` runs on every (re)connection: send `hello` there. */
export class ManagedSocket {
  state: SocketState = 'closed';
  attempts = 0;
  private sock: SocketLike | null = null;
  private timer: unknown = null;
  private stopped = false;
  private readonly factory: SocketFactory;
  private readonly random: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly backoff: BackoffOptions;

  constructor(
    private readonly url: string,
    private readonly handlers: {
      onOpen(): void;
      onText(text: string): void;
      onState(state: SocketState): void;
    },
    deps: ManagedSocketDeps = {},
  ) {
    this.factory = deps.factory ?? browserSocket;
    this.random = deps.random ?? Math.random;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.backoff = deps.backoff ?? DEFAULT_BACKOFF;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  private set(state: SocketState): void {
    this.state = state;
    this.handlers.onState(state);
  }

  private open(): void {
    this.set(this.attempts === 0 ? 'connecting' : 'reconnecting');
    let sock: SocketLike;
    try {
      sock = this.factory(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.sock = sock;
    sock.onopen = () => {
      this.attempts = 0;
      this.set('open');
      this.handlers.onOpen();
    };
    sock.onmessage = (t) => this.handlers.onText(t);
    sock.onerror = () => undefined; // `onclose` always follows
    sock.onclose = () => {
      if (this.sock === sock) this.sock = null;
      if (!this.stopped) this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    this.set('reconnecting');
    const delay = backoffDelay(this.attempts++, this.random, this.backoff);
    this.timer = this.setTimer(() => this.open(), delay);
  }

  send(text: string): boolean {
    if (this.state !== 'open' || !this.sock) return false;
    this.sock.send(text);
    return true;
  }

  close(): void {
    this.stopped = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.sock?.close();
    this.sock = null;
    this.set('closed');
  }
}
