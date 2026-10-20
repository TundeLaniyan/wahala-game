/**
 * Pure crowd-caption generator (no DOM, no audio, no Math.random).
 *
 * `captionsFor(events, state)` looks at one batch of sim events (plus the state for names, the human
 * player and the match clock) and returns zero or one short Pidgin line. Time is measured in sim
 * ticks (`state.tick`), so output is deterministic for a given seed and event stream.
 *
 * Pacing: ordinary reactions are spaced by a random 1.5-2.5 s gap and are sometimes skipped on
 * purpose (near-silence is part of the design). Warnings use half the gap. Critical moments
 * (countdown, go, last 30 s, win/draw) always speak. The last N used lines are never repeated.
 */
import type { GameState, SimEvent } from '../sim';
import { TICK_RATE } from '../sim';
import { LINES } from './captionLines';
import type { LineKey } from './captionLines';
import { createRand } from './rng';

export type CaptionTone = 'cheer' | 'tease' | 'shock' | 'warn' | 'sympathy';

export interface CrowdCaption {
  text: string;
  tone: CaptionTone;
  /** How long the UI should show it. */
  ttlMs: number;
}

export interface CaptionGenerator {
  captionsFor(events: readonly SimEvent[], state: Readonly<GameState>): CrowdCaption[];
}

/** Importance tiers. */
const NORMAL = 1;
const HIGH = 2;
const CRITICAL = 3;

const MIN_GAP_TICKS = Math.round(1.5 * TICK_RATE);
const MAX_GAP_TICKS = Math.round(2.5 * TICK_RATE);
/** How many recently used lines are excluded from the next pick. */
export const RECENT_LINES = 12;

interface Candidate {
  key: LineKey;
  tone: CaptionTone;
  priority: number;
  /** Probability of actually speaking when the pacing gate is open. */
  chance: number;
  name?: string;
}

const humanOf = (s: Readonly<GameState>): number => s.players.find((p) => !p.isBot)?.id ?? -1;
const nameOf = (s: Readonly<GameState>, id: number): string =>
  (s.players[id]?.name ?? 'Oga').replace(/[{}]/g, '').slice(0, 16) || 'Oga';

const RARE_FIRE = new Set(['diesel', 'hotfuel']);
const RARE_GADGET = new Set(['remote', 'killswitch', 'gloves', 'grip']);

function candidateFor(
  e: SimEvent,
  s: Readonly<GameState>,
  human: number,
  chainSize: number,
): Candidate | null {
  switch (e.type) {
    case 'matchStarted':
      return { key: 'go', tone: 'cheer', priority: CRITICAL, chance: 1 };
    case 'matchEnded':
      if (e.result.kind === 'draw') return { key: 'draw', tone: 'shock', priority: CRITICAL, chance: 1 };
      return e.result.winnerId === human
        ? { key: 'win', tone: 'cheer', priority: CRITICAL, chance: 1 }
        : { key: 'lose', tone: 'sympathy', priority: CRITICAL, chance: 1 };
    case 'generatorExploded':
      return chainSize > 1
        ? { key: 'chain', tone: 'cheer', priority: NORMAL, chance: 0.8 }
        : { key: 'blast', tone: 'cheer', priority: NORMAL, chance: 0.4 };
    case 'playerEliminated': {
      const victim = e.playerId;
      const name = nameOf(s, victim);
      const c = e.cause;
      if (c.kind === 'flame' && c.ownerId === victim) {
        return victim === human
          ? { key: 'selfElimYou', tone: 'tease', priority: HIGH, chance: 1 }
          : { key: 'selfElimBot', tone: 'tease', priority: HIGH, chance: 0.9, name };
      }
      if (victim === human) return { key: 'youOut', tone: 'sympathy', priority: HIGH, chance: 1 };
      if ((c.kind === 'flame' || c.kind === 'vehicle') && c.ownerId === human) {
        return { key: 'youGotOne', tone: 'cheer', priority: HIGH, chance: 1, name };
      }
      if (c.kind === 'vehicle') return { key: 'elimVehicle', tone: 'shock', priority: NORMAL, chance: 0.9 };
      if (c.kind === 'crush') return { key: 'elimCrush', tone: 'shock', priority: NORMAL, chance: 0.9 };
      if (c.kind === 'crowd') return { key: 'elimCrowd', tone: 'tease', priority: NORMAL, chance: 0.9 };
      return { key: 'botOut', tone: 'tease', priority: NORMAL, chance: 0.85, name };
    }
    case 'okadaBroken':
      return { key: 'okadaBroken', tone: 'shock', priority: NORMAL, chance: 0.9 };
    case 'okadaMounted':
      return {
        key: 'okadaMounted',
        tone: 'cheer',
        priority: NORMAL,
        chance: e.playerId === human ? 0.9 : 0.5,
      };
    case 'vehicleWarning':
      if (e.ownerId === human) return { key: 'voucherUse', tone: 'cheer', priority: HIGH, chance: 0.9 };
      return {
        key: e.kind === 'danfo' ? 'warnDanfo' : e.kind === 'taxi' ? 'warnTaxi' : 'warnKeke',
        tone: 'warn',
        priority: HIGH,
        chance: 1,
      };
    case 'vehicleDestroyed':
      return e.reason === 'blast'
        ? { key: 'vehicleBlasted', tone: 'cheer', priority: NORMAL, chance: 0.9 }
        : { key: 'vehicleCrash', tone: 'tease', priority: NORMAL, chance: 0.7 };
    case 'pickupCollected': {
      const mine = e.playerId === human;
      if (e.wasted) return { key: 'wasted', tone: 'tease', priority: NORMAL, chance: mine ? 0.8 : 0.25 };
      if (e.kind === 'voucher')
        return { key: 'voucherPick', tone: 'cheer', priority: NORMAL, chance: mine ? 0.9 : 0.5 };
      if (RARE_FIRE.has(e.kind))
        return { key: 'bigFire', tone: 'cheer', priority: NORMAL, chance: mine ? 0.9 : 0.6 };
      if (RARE_GADGET.has(e.kind))
        return { key: 'gadget', tone: 'cheer', priority: NORMAL, chance: mine ? 0.7 : 0.35 };
      return null; // common pickups stay quiet
    }
    case 'cursed':
      return { key: 'cursed', tone: 'tease', priority: NORMAL, chance: e.playerId === human ? 0.9 : 0.5 };
    case 'playerPushed':
      return { key: 'push', tone: 'tease', priority: NORMAL, chance: 0.5 };
    case 'playerDazed':
      return { key: 'daze', tone: 'tease', priority: NORMAL, chance: 0.5 };
    case 'generatorKicked':
    case 'generatorThrown':
      return { key: 'handling', tone: 'tease', priority: NORMAL, chance: 0.2 };
    case 'hazardTriggered':
      return { key: e.kind, tone: 'tease', priority: NORMAL, chance: 0.8 };
    case 'crushWarning':
      return { key: 'crushWarn', tone: 'warn', priority: NORMAL, chance: 0.35 };
    case 'crowdWarning':
      return {
        key: e.kind === 'bottle' ? 'bottleWarn' : 'bangerWarn',
        tone: 'warn',
        priority: HIGH,
        chance: 1,
      };
    case 'crowdLanded':
      return e.kind === 'bottle'
        ? { key: 'bottleLanded', tone: 'tease', priority: NORMAL, chance: 0.6 }
        : { key: 'bangLanded', tone: 'shock', priority: NORMAL, chance: 0.6 };
    default:
      return null;
  }
}

export function createCaptionGenerator(seed: number): CaptionGenerator {
  const rand = createRand(seed);
  const recent: string[] = [];
  let lastTick = -Infinity;
  let gap = MIN_GAP_TICKS;
  let announcedCountdown = false;
  let announcedLast30 = false;
  let announcedLast10 = false;

  /** Picks a line not in the recent window (falls back to any line that differs from the last). */
  const pickLine = (key: LineKey): string => {
    const pool = LINES[key] as readonly string[];
    for (let tries = 0; tries < 8; tries++) {
      const line = pool[Math.floor(rand() * pool.length)]!;
      if (!recent.includes(line)) return line;
    }
    const fresh = pool.filter((l) => !recent.includes(l));
    const from = fresh.length > 0 ? fresh : pool.filter((l) => l !== recent[recent.length - 1]);
    return from[Math.floor(rand() * from.length)] ?? pool[0]!;
  };

  const remember = (line: string): void => {
    recent.push(line);
    if (recent.length > RECENT_LINES) recent.shift();
  };

  return {
    captionsFor(events, state) {
      const human = humanOf(state);
      const pick: { best: Candidate | null } = { best: null };
      const consider = (c: Candidate | null): void => {
        if (!c) return;
        // Higher priority wins; ties are broken randomly so the first event does not always win.
        const b = pick.best;
        if (!b || c.priority > b.priority || (c.priority === b.priority && rand() < 0.5)) pick.best = c;
      };

      // State-derived moments (independent of events).
      const m = state.match;
      if (m.phase === 'countdown' && !announcedCountdown) {
        announcedCountdown = true;
        consider({ key: 'countdown', tone: 'cheer', priority: CRITICAL, chance: 1 });
      }
      if (m.phase === 'playing') {
        const left = state.config.match.durationTicks - m.playTicks;
        if (!announcedLast30 && left <= 30 * TICK_RATE) {
          announcedLast30 = true;
          consider({ key: 'last30', tone: 'warn', priority: CRITICAL, chance: 1 });
        } else if (!announcedLast10 && left <= 10 * TICK_RATE) {
          announcedLast10 = true;
          consider({ key: 'last10', tone: 'warn', priority: CRITICAL, chance: 1 });
        }
      }

      if (events.length > 0) {
        const chain = new Map<number, number>();
        for (const e of events) {
          if (e.type === 'generatorExploded') chain.set(e.eventId, (chain.get(e.eventId) ?? 0) + 1);
        }
        for (const e of events) {
          consider(
            candidateFor(e, state, human, e.type === 'generatorExploded' ? (chain.get(e.eventId) ?? 1) : 1),
          );
        }
      }
      const c = pick.best;
      if (!c) return [];

      const elapsed = state.tick - lastTick;
      const needed = c.priority >= CRITICAL ? 0 : c.priority === HIGH ? Math.floor(gap / 2) : gap;
      if (elapsed < needed) return [];
      if (c.priority < CRITICAL && rand() >= c.chance) return [];

      const template = pickLine(c.key);
      remember(template);
      const text = c.name ? template.replace('{name}', c.name) : template;
      lastTick = state.tick;
      gap = MIN_GAP_TICKS + Math.floor(rand() * (MAX_GAP_TICKS - MIN_GAP_TICKS + 1));
      const ttlMs = Math.min(4200, 1700 + text.length * 45 + (c.priority >= CRITICAL ? 700 : 0));
      return [{ text, tone: c.tone, ttlMs }];
    },
  };
}
