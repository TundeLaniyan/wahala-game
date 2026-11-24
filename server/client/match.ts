/**
 * The match side of the page: boots the REAL renderer, input and audio once, and wires them into `NetMatchClient`.
 * Nothing here simulates: it feeds server messages to the client controller and calls `frame(now)` every animation frame.
 */
import { createAudio } from '../../src/audio';
import { InputManager } from '../../src/input';
import { GameRenderer, assets, isQualitySetting } from '../../src/render';
import type { QualitySetting } from '../../src/render';
import { createGame, CHARACTER_IDS } from '../../src/sim';
import { NetMatchClient } from './NetMatchClient';
import type { ClientAudioPort, ClientTransport } from './NetMatchClient';

/** deflate-raw decompression with the browser's built-in stream (no library). */
export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface MatchView {
  canvas: HTMLCanvasElement;
  renderer: GameRenderer;
  input: InputManager;
  audio: ClientAudioPort & { unlock(): Promise<void>; stopMusic(): void };
  client: NetMatchClient;
  /** Resolves once the model library is loaded (the first keyframe waits for it). */
  assetsReady: Promise<void>;
  resize(): void;
  dispose(): void;
}

export function bootMatchView(
  canvas: HTMLCanvasElement,
  transport: ClientTransport,
  params: URLSearchParams,
): MatchView {
  const forced = params.get('q');
  const quality: QualitySetting = isQualitySetting(forced) ? forced : 'auto';
  const renderer = new GameRenderer({ canvas, quality, cameraMode: null });
  const input = new InputManager({ onNav: () => undefined, onDeviceChange: () => undefined });
  let audio: MatchView['audio'];
  try {
    audio = createAudio({}) as unknown as MatchView['audio'];
  } catch {
    audio = {
      unlock: async () => undefined,
      stopMusic: () => undefined,
      startMusic: () => undefined,
      handleEvents: () => undefined,
    };
  }
  const client = new NetMatchClient({
    renderer,
    input,
    audio,
    transport,
    inflate: inflateRaw,
    now: () => performance.now(),
  });
  /**
   * Models are loaded, then one throwaway local match is drawn twice: the browser compiles its shaders NOW (a software
   * or low-end GPU can stall for seconds on the first frame, long enough to miss server pings if it happened mid-match).
   */
  const assetsReady = assets
    .preload()
    .then(() => {
      try {
        const players = Array.from({ length: 4 }, (_, i) => ({
          name: `warm ${i}`,
          characterId: CHARACTER_IDS[i % CHARACTER_IDS.length]!,
          isBot: i > 0,
        }));
        const warm = createGame({
          seed: 1,
          arenaId: 'rumbleOshodi',
          players,
          settings: { game: 'deathmatch' },
        });
        renderer.loadGame(warm);
        const info = { localPlayerId: 0, entryOverlay: null, excitement: 0, focusPlayerId: null };
        renderer.render(warm, 0, 1 / 60, info);
        renderer.render(warm, 0.5, 1 / 60, info);
      } catch {
        /* the real match will compile them instead */
      }
    })
    .then(() => undefined);

  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.resize(w, h);
    renderer.setInsets(h < 480 ? 0.13 : 0.1, h < 480 ? 0.03 : 0.05);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // browsers start audio only after a gesture
  const unlock = (): void => {
    void audio.unlock().catch(() => undefined);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  return {
    canvas,
    renderer,
    input,
    audio,
    client,
    assetsReady,
    resize,
    dispose(): void {
      observer.disconnect();
      renderer.dispose();
    },
  };
}
