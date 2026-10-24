/**
 * Composition root: the only place that knows every layer. It creates the renderer, input,
 * audio, bots and match controller, runs the animation loop, and exposes `commands` to the UI.
 */
import { createBot } from '../ai';
import { createAudio } from '../audio';
import type { SpokenTrace } from '../audio';
import { InputManager } from '../input';
import { GameRenderer, assets, renderCastPortraits } from '../render';
import { registerBusts } from '../assets/portraits';
import type { CharacterId, GameState, SimEvent } from '../sim';
import { enterImmersiveMode } from './fullscreen';
import { AttractController } from './AttractController';
import { MatchController } from './MatchController';
import { TutorialController } from './TutorialController';
import { NULL_AUDIO } from './ports';
import type { AudioPort } from './ports';
import { saveSettings } from './settings';
import type { GameSettings } from './settings';
import { patch, useGameStore } from './store';
import type { ScreenPoint } from './store';
import { createSubtitleFeed } from './subtitles';

let controller: MatchController | null = null;
let attract: AttractController | null = null;
let tutorial: TutorialController | null = null;
let renderer: GameRenderer | null = null;
let audio: AudioPort = NULL_AUDIO;
let raf = 0;
let canvasEl: HTMLCanvasElement | null = null;
let resizeObserver: ResizeObserver | null = null;

/** The voice line playing now, for the optional subtitles (the HUD shows it only when the setting is on). */
const subtitles = createSubtitleFeed({
  get: () => useGameStore.getState().subtitle,
  set: (subtitle) => patch({ subtitle }),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});
/** Debug (`?debug`): the last voice lines the engine scheduled, newest last. */
const spokenLog: SpokenTrace[] = [];
const onSpeak = (t: SpokenTrace): void => {
  spokenLog.push(t);
  if (spokenLog.length > 64) spokenLog.shift();
  subtitles.push(t);
};

const input = new InputManager({
  onNav: (c) => controller?.handleNav(c),
  onDeviceChange: (device) => patch({ device }),
});

function applyAudioSettings(s: GameSettings): void {
  // volumes live in the persistent audio preferences (src/audio/prefs.ts), which the engine follows itself
  audio.setMuted(s.muted);
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  if (!controller) return;
  if (useGameStore.getState().screen === 'title') attract?.frame(now);
  else {
    controller.frame(now);
    if (useGameStore.getState().tutorial) tutorial?.frame();
  }
  if (now - lastBoardCheck > 250) {
    lastBoardCheck = now;
    publishBoard();
  }
  if (useGameStore.getState().showStats && renderer && Math.floor(now / 500) !== lastStatsTick) {
    lastStatsTick = Math.floor(now / 500);
    patch({ stats: renderer.stats() });
  }
}
let lastStatsTick = 0;
let lastBoardCheck = -Infinity;

/** Publishes where the board is on screen (only when it moved by a pixel or more), for the HUD layout. */
function publishBoard(): void {
  const st = useGameStore.getState();
  const corners: ScreenPoint[] | null =
    st.screen === 'playing' && renderer
      ? (renderer.boardScreenCorners()?.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) ?? null)
      : null;
  const prev = st.board;
  const same =
    prev === corners ||
    (prev !== null &&
      corners !== null &&
      prev.length === corners.length &&
      prev.every((p, i) => p.x === corners[i]!.x && p.y === corners[i]!.y));
  if (!same) patch({ board: corners });
}
/** Camera view used inside How to Play (never saved). */
let tutorialView: 'action' | 'overview' = 'action';

function sizeCanvas(): void {
  if (!canvasEl || !renderer) return;
  const w = canvasEl.clientWidth;
  const h = canvasEl.clientHeight;
  renderer.resize(w, h);
  const portrait = h > w * 1.1;
  const touch = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
  patch({ portrait: portrait && touch, touchCapable: touch });
  // Leave room for the HUD: phones in landscape have little vertical space.
  renderer.setInsets(h < 480 ? 0.13 : 0.1, h < 480 ? 0.03 : 0.05);
}

/** Attaches the game to a canvas and starts the render loop. Call once. */
export function mount(canvas: HTMLCanvasElement): () => void {
  canvasEl = canvas;
  const params = new URLSearchParams(location.search);
  const forced = params.get('q');
  if (forced === 'low' || forced === 'medium' || forced === 'high')
    patch({ settings: { ...useGameStore.getState().settings, quality: forced } });
  const settings = useGameStore.getState().settings;
  const cameraOverride = params.get('cam') === 'stadium' ? 'stadium' : null;
  patch({ cameraOverride });
  try {
    renderer = new GameRenderer({
      canvas,
      quality: settings.quality,
      cameraMode: cameraOverride,
      onContextLost: () =>
        patch({
          fatal:
            'The graphics context was lost (the device may be low on memory). Reload the page to continue.',
        }),
    });
  } catch (error) {
    patch({
      fatal: `WebGL could not start (${error instanceof Error ? error.message : 'unknown error'}). Try a different browser or enable hardware acceleration.`,
    });
    return () => undefined;
  }
  try {
    audio = createAudio({ onSpeak });
  } catch {
    audio = NULL_AUDIO;
  }
  controller = new MatchController({
    renderer: renderer as never,
    input,
    botFactory: params.has('nobots') ? () => ({ decide: () => ({}) }) : createBot,
    audio,
  });
  applyAudioSettings(settings);
  renderer.setCameraView(settings.cameraView);
  attract = new AttractController(renderer as never, createBot);
  tutorial = new TutorialController(controller, {
    stopAttract: () => attract?.stop(),
    startAttract: () => {
      if (settingsAllowAttract()) attract?.start();
    },
    menuCharacter: () => useGameStore.getState().settings.character,
  });
  // The live demo behind the menu is skipped for tests (?nobots / ?noattract) and on the lowest quality.
  // Models load once; the live demo behind the menu starts when the rigged cast is ready.
  patch({ loading: { done: 0, total: 1 } });
  void assets
    .preload(undefined, (done, total) => patch({ loading: { done, total } }))
    .then(() => {
      try {
        registerBusts(renderCastPortraits());
      } catch {
        /* portraits fall back to the drawn versions */
      }
      patch({ loading: null, portraitsVersion: useGameStore.getState().portraitsVersion + 1 });
      if (
        !params.has('nobots') &&
        !params.has('noattract') &&
        settings.quality !== 'low' &&
        useGameStore.getState().screen === 'title'
      )
        attract?.start();
    });
  resizeObserver = new ResizeObserver(sizeCanvas);
  resizeObserver.observe(canvas);
  sizeCanvas();
  patch({ touchCapable: window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window });
  raf = requestAnimationFrame(frame);

  const onVisibility = (): void => {
    if (document.hidden && useGameStore.getState().screen === 'playing') controller?.setPaused(true);
  };
  // Stadium camera toggle (O): presentation only, so it lives outside the gameplay input mapping.
  // Standard matches always show the whole arena, so the key does nothing there.
  const onCameraKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyO' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (useGameStore.getState().screen !== 'playing' || renderer?.cameraMode() !== 'stadium') return;
    // in the tutorial the view toggles for this lesson only; the saved preference is untouched
    if (useGameStore.getState().tutorial) {
      tutorialView = tutorialView === 'overview' ? 'action' : 'overview';
      renderer.setCameraView(tutorialView);
    } else commands.toggleCameraView();
  };
  window.addEventListener('keydown', onCameraKey);
  // City Rumble spectating: cycle the survivor the camera follows (presentation only).
  const onSpectateKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (useGameStore.getState().screen !== 'playing' || !useGameStore.getState().hud?.rumble?.spectating)
      return;
    const dir = SPECTATE_KEYS[e.code];
    if (dir) commands.spectate(dir);
  };
  window.addEventListener('keydown', onSpectateKey);
  const unlock = (): void => {
    void audio.unlock().then(() => patch({ audioReady: true }));
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  exposeDebugHandle();

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('keydown', onCameraKey);
    window.removeEventListener('keydown', onSpectateKey);
    resizeObserver?.disconnect();
    renderer?.dispose();
    renderer = null;
    controller = null;
    tutorial = null;
  };
}

function settingsAllowAttract(): boolean {
  const params = new URLSearchParams(location.search);
  return (
    !params.has('nobots') && !params.has('noattract') && useGameStore.getState().settings.quality !== 'low'
  );
}

/** Everything the UI can ask the game to do. */
export const commands = {
  start(): void {
    void audio.unlock();
    if (useGameStore.getState().touchCapable) void enterImmersiveMode();
    audio.playUi('start');
    attract?.stop();
    subtitles.clear();
    const seed = Number(new URLSearchParams(location.search).get('seed'));
    controller?.start(useGameStore.getState().settings, Number.isFinite(seed) && seed > 0 ? seed : undefined);
  },
  rematch(): void {
    audio.playUi('start');
    subtitles.clear();
    controller?.rematch();
  },
  toTitle(): void {
    audio.playUi('back');
    subtitles.clear();
    controller?.stop();
    if (settingsAllowAttract()) attract?.start();
  },
  togglePause: (): void => controller?.togglePause(),
  resume: (): void => controller?.setPaused(false),
  skipToResults: (): void => controller?.skipToResults(),
  /** City Rumble spectator: watch the next (1) or previous (-1) survivor. */
  spectate: (dir: 1 | -1): void => controller?.cycleSpectate(dir),
  entryConfirm: (): void => controller?.confirmEntry(),
  entryCancel: (): void => controller?.cancelEntry(),
  pickEntry: (x: number, y: number): void => controller?.pickEntry(x, y),
  click: (): void => audio.playUi('click'),
  updateSettings(p: Partial<GameSettings>): void {
    const settings = { ...useGameStore.getState().settings, ...p };
    patch({ settings });
    saveSettings(settings);
    applyAudioSettings(settings);
    if (p.quality) renderer?.setQuality(p.quality);
    if (p.cameraView) renderer?.setCameraView(p.cameraView);
  },
  // ---- How to Play (tutorial): isolated from competitive play, never writes the saved settings
  openTutorial(chapter = 0): void {
    void audio.unlock();
    audio.playUi('click');
    tutorialView = useGameStore.getState().settings.cameraView;
    renderer?.setCameraView(tutorialView);
    tutorial?.open(chapter);
  },
  tutorialWatch: (chapter?: number): void => tutorial?.watch(chapter),
  tutorialPractice: (chapter?: number): void => tutorial?.practice(chapter),
  tutorialReplay: (): void => tutorial?.replay(),
  tutorialNext: (): void => tutorial?.next(),
  tutorialPrev: (): void => tutorial?.prev(),
  tutorialPause: (): void => tutorial?.togglePause(),
  tutorialCharacter: (c: CharacterId): void => tutorial?.setCharacter(c),
  exitTutorial(): void {
    audio.playUi('back');
    renderer?.setCameraView(useGameStore.getState().settings.cameraView);
    tutorial?.exit();
  },
  toggleCameraView(): void {
    const view = useGameStore.getState().settings.cameraView === 'overview' ? 'action' : 'overview';
    commands.updateSettings({ cameraView: view });
  },
};

export { input };

/** Keys that switch the spectated survivor (the local player is out, so they move nobody). */
const SPECTATE_KEYS: Record<string, 1 | -1> = {
  ArrowLeft: -1,
  KeyA: -1,
  KeyQ: -1,
  BracketLeft: -1,
  ArrowRight: 1,
  KeyD: 1,
  KeyE: 1,
  BracketRight: 1,
};

/**
 * The running match for presentation widgets that draw the board themselves (the City Rumble
 * minimap). Read-only: never mutate the returned state.
 */
export function liveMatch(): { state: GameState; focusId: number } | null {
  const state = controller?.state;
  if (!state) return null;
  return { state, focusId: controller?.spectating ?? 0 };
}

/** Debug/test hook, enabled with `?debug` in the URL (used by the Playwright suite). */
function exposeDebugHandle(): void {
  if (!new URLSearchParams(location.search).has('debug')) return;
  const w = window as unknown as { __WAHALA__?: unknown };
  w.__WAHALA__ = {
    getState: (): GameState | null => controller?.state ?? null,
    controller: () => controller,
    tutorial: () => tutorial,
    store: useGameStore,
    stats: () => renderer?.stats() ?? null,
    renderer: () => renderer,
    assets: () => ({ loaded: assets.loadedIds(), failed: assets.failedIds() }),
    music: () => (audio as { musicStatus?: () => unknown }).musicStatus?.() ?? null,
    /** Voice registry and per-match loading state, and the lines scheduled so far. */
    voices: () => (audio as { voiceStatus?: () => unknown }).voiceStatus?.() ?? null,
    voiceReport: () => (audio as { whenVoicesLoaded?: () => Promise<unknown> }).whenVoicesLoaded?.() ?? null,
    voiceSceneLoaded: () =>
      (audio as { whenVoiceSceneLoaded?: () => Promise<void> }).whenVoiceSceneLoaded?.() ?? null,
    spoken: () => spokenLog.slice(),
    /** Plays a line of this voice trigger now (stops the current line first). */
    previewVoice: (trigger: string) =>
      (audio as { previewVoice?: (t: string) => boolean }).previewVoice?.(trigger) ?? false,
    /** Feeds a batch of sim events to the audio only (voice and sound checks; the match itself is untouched). */
    hear: (events: SimEvent[]) => {
      const state = controller?.state;
      if (state) audio.handleEvents(events, state);
    },
    stepTicks: (n: number) => {
      for (let i = 0; i < n; i++) controller?.stepOnce();
    },
    /** Like stepTicks, but every tick's events reach the renderer, audio and HUD as in real play. */
    advance: (n: number) => controller?.debugAdvance(n),
  };
}
