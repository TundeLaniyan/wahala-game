/**
 * The MATCH LOADING lifecycle (docs/MATCH_LOADING.md, decisions ML1-ML8). Every way into a match (Start, Quick play,
 * Rematch, a campaign mission, a raid) goes through `MatchLoader.run`, so a tap is acknowledged at once and the heavy,
 * synchronous 3D set-up never runs before the loading screen has painted:
 *
 *   starting  the tap is taken; the loading screen is shown and the loader waits for it to paint (two animation frames,
 *             with a timer fallback for a throttled tab), so the menu never just sits there;
 *   assets    the game models are still loading from the boot preload: the real count is shown ("8 / 31"); a model
 *             that fails has a drawn fallback, and after `assetWaitMs` the match starts anyway (never an endless wait);
 *   arena     the board, the fighters and the scene are built (`start`, synchronous); an error here is a failure;
 *   scene     the match is held (no simulation time passes) until the renderer has drawn `firstFrames` frames of it, so
 *             the countdown is not eaten by shader compiles; after `sceneWaitMs` the screen is removed regardless;
 *   failed    the reason, Retry (the same start again) and Back (to where the player came from).
 *
 * One run at a time: a second Play / Start tap while one is in flight is ignored (no second session). Nothing here
 * touches the DOM or audio directly (the session injects them), so the whole lifecycle is unit-tested with fakes.
 */
export type MatchLoadKind = 'match' | 'rematch' | 'mission' | 'raid';
export type MatchLoadPhase = 'starting' | 'assets' | 'arena' | 'scene' | 'failed';

export interface MatchLoadState {
  /** Increases with every run (tests and the UI key on it). */
  id: number;
  kind: MatchLoadKind;
  phase: MatchLoadPhase;
  /** Models loaded so far / to load, during `assets` only (real numbers, never invented progress). */
  assets: { done: number; total: number } | null;
  /** Why the start failed (phase `failed`). */
  error: string | null;
}

export interface MatchLoaderDeps {
  /** Publishes the loading state (null = no loading screen). */
  publish: (state: MatchLoadState | null) => void;
  /** Resolves once the browser has painted what was just published. */
  afterPaint: () => Promise<void>;
  /** The boot model preload still running (null = done), and its live counts. */
  assetsPending: () => Promise<unknown> | null;
  assetCounts: () => { done: number; total: number } | null;
  /** Resolves when the renderer has drawn `n` frames of the new match (counted from the call). */
  framesDrawn: (n: number) => Promise<void>;
  /** Hold / release the new match's simulation while the loading screen is up. */
  hold: (held: boolean) => void;
  /** Resolves after `ms` (injected so tests use fake time). */
  wait: (ms: number) => Promise<void>;
}

export interface MatchLoaderOptions {
  assetWaitMs: number;
  sceneWaitMs: number;
  firstFrames: number;
}

export const DEFAULT_LOADER_OPTIONS: MatchLoaderOptions = {
  assetWaitMs: 20_000,
  sceneWaitMs: 12_000,
  firstFrames: 2,
};

interface Run {
  kind: MatchLoadKind;
  start: () => void;
  back: () => void;
}

export class MatchLoader {
  private seq = 0;
  private current: MatchLoadState | null = null;
  private last: Run | null = null;
  private inFlight = false;
  /** Extra delay before building (the `?debug&loaddelay=ms` flag, for testing a slow start; 0 otherwise). */
  private debugDelayMs = 0;

  constructor(
    private readonly deps: MatchLoaderDeps,
    private readonly opts: MatchLoaderOptions = DEFAULT_LOADER_OPTIONS,
  ) {}

  setDebugDelay(ms: number): void {
    this.debugDelayMs = Math.max(0, ms);
  }

  /** Is a start in flight or a failure on screen? (Further Play taps are ignored meanwhile.) */
  get busy(): boolean {
    return this.inFlight || this.current !== null;
  }

  get state(): MatchLoadState | null {
    return this.current;
  }

  /**
   * Starts a match the safe way. `start` does the synchronous set-up (create the game, build the scene); `back` undoes
   * a failed one (to the menu / the map). Resolves true when the match is on screen and playable, false when it was
   * ignored (a run in flight) or failed (the failure screen is up).
   */
  async run(kind: MatchLoadKind, start: () => void, back: () => void): Promise<boolean> {
    if (this.busy) return false;
    this.inFlight = true;
    this.last = { kind, start, back };
    try {
      return await this.go(this.last);
    } finally {
      this.inFlight = false;
    }
  }

  /** The failure screen's Retry: the same start again. */
  async retry(): Promise<boolean> {
    const last = this.last;
    if (!last || this.inFlight || this.current?.phase !== 'failed') return false;
    this.inFlight = true;
    try {
      return await this.go(last);
    } finally {
      this.inFlight = false;
    }
  }

  /** The failure screen's Back. */
  back(): void {
    if (this.inFlight || this.current?.phase !== 'failed') return;
    this.set(null);
    this.last?.back();
  }

  /** Something else ended the match (Main menu, a new screen): never leave a loading screen behind. */
  clear(): void {
    if (this.inFlight) return;
    this.deps.hold(false);
    this.set(null);
  }

  private set(state: MatchLoadState | null): void {
    this.current = state;
    this.deps.publish(state);
  }

  private phase(kind: MatchLoadKind, phase: MatchLoadPhase, extra: Partial<MatchLoadState> = {}): void {
    this.set({ id: this.seq, kind, phase, assets: null, error: null, ...extra });
  }

  private async go(run: Run): Promise<boolean> {
    const { deps, opts } = this;
    this.seq++;
    // 1. acknowledge at once and let the loading screen paint before any heavy work
    this.phase(run.kind, 'starting');
    await deps.afterPaint();
    if (this.debugDelayMs) await deps.wait(this.debugDelayMs);

    // 2. the boot preload may still be running on a slow connection: show the real count, never wait for ever
    const pending = deps.assetsPending();
    if (pending) {
      this.phase(run.kind, 'assets', { assets: deps.assetCounts() });
      let settled = false;
      void pending.then(() => (settled = true));
      const deadline = deps.wait(opts.assetWaitMs);
      // refresh the count while waiting (a few times a second), until it is done or the deadline passes
      let timedOut = false;
      void deadline.then(() => (timedOut = true));
      while (!settled && !timedOut) {
        await Promise.race([pending, deadline, deps.wait(250)]);
        if (!settled && !timedOut) this.phase(run.kind, 'assets', { assets: deps.assetCounts() });
      }
    }

    // 3. build the arena and the scene (synchronous); the match is held until its first frames are drawn
    this.phase(run.kind, 'arena');
    await deps.afterPaint();
    deps.hold(true);
    try {
      run.start();
    } catch (error) {
      deps.hold(false);
      this.phase(run.kind, 'failed', {
        error: error instanceof Error && error.message ? error.message : 'The match could not be set up.',
      });
      return false;
    }

    // 4. wait for the first drawn frames (shader compiles), never longer than `sceneWaitMs`
    this.phase(run.kind, 'scene');
    await Promise.race([deps.framesDrawn(opts.firstFrames), deps.wait(opts.sceneWaitMs)]);
    deps.hold(false);
    this.set(null);
    return true;
  }
}

/** The loading screen's headline for a kind of start. */
export function loadTitle(kind: MatchLoadKind): string {
  switch (kind) {
    case 'mission':
      return 'Heading into the district';
    case 'raid':
      return 'Breaking into the raid';
    case 'rematch':
      return 'Setting up the rematch';
    default:
      return 'Starting the match';
  }
}

/** One line for the current phase (the UI shows it beside the step list). */
export function loadStep(state: MatchLoadState): string {
  switch (state.phase) {
    case 'starting':
      return 'Getting ready…';
    case 'assets':
      return state.assets
        ? `Loading fighters and vehicles ${state.assets.done} / ${state.assets.total}`
        : 'Loading fighters and vehicles…';
    case 'arena':
      return 'Building the arena…';
    case 'scene':
      return 'Almost there…';
    case 'failed':
      return 'Could not start';
  }
}
