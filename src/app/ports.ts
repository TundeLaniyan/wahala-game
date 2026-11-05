/**
 * Narrow interfaces the match controller depends on. They let the controller be tested without a
 * browser and let each subsystem be swapped or stubbed independently.
 */
import type {
  Dir,
  Difficulty,
  GameOptions,
  GameState,
  Intent,
  MissionOutcome,
  Observation,
  RaidId,
  RaidOutcome,
  RaidRequest,
  SimEvent,
} from '../sim';
import type { ActionName, IntentContext } from '../input';
import type { EntryPick, FrameInfo, QualitySetting } from '../render';

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

export interface RendererPort {
  loadGame(state: GameState): void;
  handleEvents(events: readonly SimEvent[], state: GameState): void;
  render(state: GameState, alpha: number, dt: number, info: FrameInfo): void;
  pickEntry(clientX: number, clientY: number): EntryPick | null;
  setQuality(setting: QualitySetting): void;
}

export interface InputPort {
  navMode: boolean;
  pollDevices(): void;
  /** The local player's intent for this tick (`ctx`: can they step, is a remote live, move legality). */
  buildIntent(tick: number, ctx?: IntentContext): Intent;
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

/** What a campaign mission hands the match controller besides the game options. */
export interface MissionMeta {
  missionId: string;
  /** Crew bot level (the boss is always played at least at Standard). */
  difficulty: Difficulty;
  /** The mission is over (the sim reported an outcome, or the match ended without one: `null`). Called once. */
  onEnd(outcome: MissionOutcome | null, state: GameState): void;
  /** A field mission's door raised a raid request (`state.mission.pendingRaid`); called once per request. */
  onRaid?(request: RaidRequest, state: GameState): void;
}

/** What the app hands the match controller for a raid (a door of a field mission, or a standalone section raid). */
export interface RaidMeta {
  raidId: RaidId;
  /** Enemy bot level. */
  difficulty: Difficulty;
  /** The raid is over (the sim reported an outcome, or the match ended without one). Called once. */
  onEnd(outcome: RaidOutcome): void;
}

/** The part of the match controller the campaign controller drives (so tests can fake it). */
export interface MissionHost {
  startMission(options: GameOptions, meta: MissionMeta): void;
  /** Leaves the running mission for the menus (no results screen). */
  stop(): void;
  /**
   * Plays a raid. A running field mission is kept alive and PAUSED underneath (the door case) and comes back with
   * `resumeField`; with no field mission the raid is standalone. Calling it again during a raid restarts the raid (retry).
   */
  playRaid?(options: GameOptions, meta: RaidMeta): void;
  /**
   * The raid is over: puts the stashed field mission back as the active game after `resolve` has answered its door
   * (the events it returns are shown like any tick's). False when no field mission is stashed (a standalone raid).
   */
  resumeField?(resolve: (field: GameState) => SimEvent[]): boolean;
  /** The game being played right now (the raid state during a raid), for the app's pause-menu actions. */
  current?(): GameState | null;
  /** A short HUD notice. */
  notice?(text: string): void;
}
