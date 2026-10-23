/**
 * Narrow interfaces the match controller depends on. They let the controller be tested without a
 * browser and let each subsystem be swapped or stubbed independently.
 */
import type { Dir, GameState, Intent, Observation, SimEvent, Difficulty } from '../sim';
import type { ActionName } from '../input';
import type { EntryPick, FrameInfo, QualityLevel } from '../render';

export interface Bot {
  decide(obs: Observation): Intent;
}
export type BotFactory = (opts: { difficulty: Difficulty; seed: number; playerId: number }) => Bot;

export interface AudioPort {
  unlock(): Promise<void>;
  setVolumes(v: { master: number; music: number; sfx: number }): void;
  setMuted(muted: boolean): void;
  /** Starts the crowd / bus-park ambience (there is no music). */
  startMusic(): void;
  stopMusic(): void;
  setIntensity(level: number): void;
  handleEvents(events: readonly SimEvent[], state: Readonly<GameState>): void;
  playUi(kind: 'click' | 'back' | 'start' | 'countdown' | 'go'): void;
  /** Follow camera (City Rumble): pan relative to this tile x; null = across the whole arena. Optional. */
  setListener?(x: number | null): void;
}

export interface CrowdCaptionLine {
  text: string;
  tone: 'cheer' | 'tease' | 'shock' | 'warn' | 'sympathy';
  ttlMs: number;
}
export interface CaptionPort {
  captionsFor(events: readonly SimEvent[], state: Readonly<GameState>): CrowdCaptionLine[];
}

export interface RendererPort {
  loadGame(state: GameState): void;
  handleEvents(events: readonly SimEvent[], state: GameState): void;
  render(state: GameState, alpha: number, dt: number, info: FrameInfo): void;
  pickEntry(clientX: number, clientY: number): EntryPick | null;
  setQuality(level: QualityLevel | 'auto'): void;
}

export interface InputPort {
  navMode: boolean;
  pollDevices(): void;
  buildIntent(tick: number, canMove?: boolean): Intent;
  takeVehiclePress(): boolean;
  clear(): void;
}

export type { Dir, ActionName };

export const NULL_AUDIO: AudioPort = {
  unlock: () => Promise.resolve(),
  setVolumes: () => undefined,
  setMuted: () => undefined,
  startMusic: () => undefined,
  stopMusic: () => undefined,
  setIntensity: () => undefined,
  handleEvents: () => undefined,
  playUi: () => undefined,
};

export const NULL_CAPTIONS: CaptionPort = { captionsFor: () => [] };
