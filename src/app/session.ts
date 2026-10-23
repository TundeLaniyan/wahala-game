/**
 * Composition root: the only place that knows every layer. It creates the renderer, input,
 * audio, bots and match controller, runs the animation loop, and exposes `commands` to the UI.
 */
import { createBot } from '../ai';
import { createAudio, createCaptionGenerator } from '../audio';
import { InputManager } from '../input';
import { GameRenderer, assets, renderCastPortraits } from '../render';
import { registerBusts } from '../assets/portraits';
import type { GameState } from '../sim';
import { enterImmersiveMode } from './fullscreen';
import { AttractController } from './AttractController';
import { MatchController } from './MatchController';
import { NULL_AUDIO } from './ports';
import type { AudioPort, CaptionPort } from './ports';
import { saveSettings } from './settings';
import type { GameSettings } from './settings';
import { patch, useGameStore } from './store';

let controller: MatchController | null = null;
let attract: AttractController | null = null;
let renderer: GameRenderer | null = null;
let audio: AudioPort = NULL_AUDIO;
let raf = 0;
let canvasEl: HTMLCanvasElement | null = null;
let resizeObserver: ResizeObserver | null = null;

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
  else controller.frame(now);
  if (useGameStore.getState().showStats && renderer && Math.floor(now / 500) !== lastStatsTick) {
    lastStatsTick = Math.floor(now / 500);
    patch({ stats: renderer.stats() });
  }
}
let lastStatsTick = 0;

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
    audio = createAudio();
  } catch {
    audio = NULL_AUDIO;
  }
  const captionGen = createCaptionGenerator(Date.now() & 0xffff);
  const captions: CaptionPort = { captionsFor: (events, state) => captionGen.captionsFor(events, state) };
  controller = new MatchController({
    renderer: renderer as never,
    input,
    botFactory: params.has('nobots') ? () => ({ decide: () => ({}) }) : createBot,
    audio,
    captions,
  });
  applyAudioSettings(settings);
  renderer.setCameraView(settings.cameraView);
  attract = new AttractController(renderer as never, createBot);
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
    if (useGameStore.getState().screen === 'playing' && renderer?.cameraMode() === 'stadium')
      commands.toggleCameraView();
  };
  window.addEventListener('keydown', onCameraKey);
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
    resizeObserver?.disconnect();
    renderer?.dispose();
    renderer = null;
    controller = null;
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
    const seed = Number(new URLSearchParams(location.search).get('seed'));
    controller?.start(useGameStore.getState().settings, Number.isFinite(seed) && seed > 0 ? seed : undefined);
  },
  rematch(): void {
    audio.playUi('start');
    controller?.rematch();
  },
  toTitle(): void {
    audio.playUi('back');
    controller?.stop();
    if (settingsAllowAttract()) attract?.start();
  },
  togglePause: (): void => controller?.togglePause(),
  resume: (): void => controller?.setPaused(false),
  skipToResults: (): void => controller?.skipToResults(),
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
  toggleCameraView(): void {
    const view = useGameStore.getState().settings.cameraView === 'overview' ? 'action' : 'overview';
    commands.updateSettings({ cameraView: view });
  },
};

export { input };

/** Debug/test hook, enabled with `?debug` in the URL (used by the Playwright suite). */
function exposeDebugHandle(): void {
  if (!new URLSearchParams(location.search).has('debug')) return;
  const w = window as unknown as { __WAHALA__?: unknown };
  w.__WAHALA__ = {
    getState: (): GameState | null => controller?.state ?? null,
    controller: () => controller,
    store: useGameStore,
    stats: () => renderer?.stats() ?? null,
    renderer: () => renderer,
    assets: () => ({ loaded: assets.loadedIds(), failed: assets.failedIds() }),
    music: () => (audio as { musicStatus?: () => unknown }).musicStatus?.() ?? null,
    stepTicks: (n: number) => {
      for (let i = 0; i < n; i++) controller?.stepOnce();
    },
  };
}
