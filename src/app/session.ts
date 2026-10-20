/**
 * Composition root: the only place that knows every layer. It creates the renderer, input,
 * audio, bots and match controller, runs the animation loop, and exposes `commands` to the UI.
 */
import { createBot } from '../ai';
import { createAudio, createCaptionGenerator } from '../audio';
import { InputManager } from '../input';
import { GameRenderer } from '../render';
import type { GameState } from '../sim';
import { MatchController } from './MatchController';
import { NULL_AUDIO } from './ports';
import type { AudioPort, CaptionPort } from './ports';
import { saveSettings } from './settings';
import type { GameSettings } from './settings';
import { patch, useGameStore } from './store';

let controller: MatchController | null = null;
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
  audio.setVolumes({ master: 1, music: s.musicVolume, sfx: s.sfxVolume });
  audio.setMuted(s.muted);
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  if (!controller) return;
  controller.frame(now);
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
  renderer = new GameRenderer({ canvas, quality: settings.quality });
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
    botFactory: createBot,
    audio,
    captions,
  });
  applyAudioSettings(settings);
  resizeObserver = new ResizeObserver(sizeCanvas);
  resizeObserver.observe(canvas);
  sizeCanvas();
  patch({ touchCapable: window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window });
  raf = requestAnimationFrame(frame);

  const onVisibility = (): void => {
    if (document.hidden && useGameStore.getState().screen === 'playing') controller?.setPaused(true);
  };
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
    resizeObserver?.disconnect();
    renderer?.dispose();
    renderer = null;
    controller = null;
  };
}

/** Everything the UI can ask the game to do. */
export const commands = {
  start(): void {
    void audio.unlock();
    audio.playUi('start');
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
    stepTicks: (n: number) => {
      for (let i = 0; i < n; i++) controller?.stepOnce();
    },
  };
}
