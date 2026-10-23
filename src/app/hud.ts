import { CHARACTERS, secondsRemaining } from '../sim';
import type { CharacterId, CurseKind, GameState, MatchResult, VehicleKind } from '../sim';
import { buildStageAlerts, ruleBannerFor } from './stageAlerts';
import type { StageAlert } from './stageAlerts';

export type { StageAlert } from './stageAlerts';

export interface HudPlayer {
  id: number;
  name: string;
  slot: number;
  characterId: CharacterId;
  alive: boolean;
  isLocal: boolean;
  mounted: boolean;
}

export interface HudMe {
  range: number;
  maxRange: boolean;
  capacity: number;
  active: number;
  speedLevel: number;
  kick: boolean;
  punch: boolean;
  grip: boolean;
  remote: boolean;
  killCharges: number;
  sneakers: boolean;
  hotFuel: boolean;
  /** Generator Pass: walks over generators. */
  bombPass: boolean;
  mounted: boolean;
  voucher: boolean;
  vehicle: VehicleKind;
  carrying: boolean;
  dazed: boolean;
  curse: { kind: CurseKind; seconds: number } | null;
  skillReady: boolean;
  hasRemoteGenerator: boolean;
  canDisarm: boolean;
  canAction: boolean;
}

export interface HudSnapshot {
  phase: GameState['match']['phase'];
  countdown: number;
  secondsLeft: number;
  final30: boolean;
  players: HudPlayer[];
  me: HudMe | null;
  localAlive: boolean;
  result: MatchResult | null;
  entry: { stage: 'entry' | 'turn'; fraction: number; vehicle: VehicleKind } | null;
  crush: boolean;
  /** Stage hazards that concern the local player right now (most urgent first). */
  stageAlerts: StageAlert[];
  /** The arena's special rule, shown big during the countdown (null when there is none / after it). */
  ruleBanner: string | null;
}

/** Pure projection of the simulation into what the HUD displays. */
export function buildHud(state: GameState, localId: number, entry: HudSnapshot['entry']): HudSnapshot {
  const local = state.players[localId];
  const active = local
    ? state.generators.filter((g) => g.ownerId === local.id && g.mode !== 'disabled').length
    : 0;
  const cfg = state.config;
  const me: HudMe | null = local
    ? {
        range: Math.min(local.range, cfg.generator.maxRange),
        maxRange: local.range >= cfg.generator.dieselRange,
        capacity: local.capacity,
        active,
        speedLevel: local.speedLevel,
        kick: local.kick,
        punch: local.punch,
        grip: local.grip,
        remote: local.remote,
        killCharges: local.killSwitchCharges,
        sneakers: local.sneakers,
        hotFuel: local.hotFuel,
        bombPass: local.bombPass,
        mounted: local.mounted,
        voucher: local.hasVoucher,
        vehicle: CHARACTERS[local.characterId].vehicle,
        carrying: local.carrying !== null,
        dazed: state.tick < local.dazedUntil,
        curse:
          local.curse && state.tick < local.curse.until
            ? { kind: local.curse.kind, seconds: Math.ceil((local.curse.until - state.tick) / 60) }
            : null,
        skillReady: state.tick >= local.skillReadyTick,
        hasRemoteGenerator: state.generators.some((g) => g.ownerId === local.id && g.mode === 'remote'),
        canDisarm: local.killSwitchCharges > 0,
        canAction: local.grip || local.punch || local.carrying !== null,
      }
    : null;
  return {
    phase: state.match.phase,
    countdown:
      state.match.phase === 'countdown' ? Math.max(1, Math.ceil(state.match.countdownRemaining / 60)) : 0,
    secondsLeft: secondsRemaining(state),
    final30: state.match.phase === 'playing' && secondsRemaining(state) <= 30,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      characterId: p.characterId,
      alive: p.alive,
      isLocal: p.id === localId,
      mounted: p.mounted,
    })),
    me,
    localAlive: local?.alive ?? false,
    result: state.match.result,
    entry,
    crush: state.crush !== null,
    stageAlerts: buildStageAlerts(state, localId),
    ruleBanner: ruleBannerFor(state),
  };
}
