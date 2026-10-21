/**
 * Crowd reaction director. Decides WHEN the synthesised crowd reacts, never what is said.
 *
 * Callers ask for a reaction ("gasp", strength 0.7, maybe 60% of the time"). The director applies:
 *  - per-kind cooldowns and a global spacing so reactions never pile up into noise;
 *  - a cap on simultaneously sounding reactions (mobile CPU);
 *  - a seeded dice roll (`chance` < 1), halved when the crowd just reacted, so silence is allowed and
 *    ordinary effects can be heard (`chance` 1 always reacts, subject to the limits above);
 *  - variant rotation (never the same recording twice in a row);
 *  - excitement scaling: louder and a bit more eager at high intensity.
 * Critical moments (`force`) bypass chance and spacing, but still respect the voice cap.
 *
 * Street mode (`opts.street`, used by the engine): WAHALA! happens in a Lagos bus park, not a football
 * stadium. Stadium-style `roar` and `cheerBig` reactions are demoted to ordinary, quieter `cheer`s so
 * the crowd never swells into a roar; the spoken Pidgin lines (pidgin.ts) carry the personality instead.
 */
import type { SoundId } from './recipes';
import type { Mixer } from './mixer';
import { createRand } from './rng';

export type ReactionKind =
  'cheer' | 'cheerBig' | 'ooh' | 'gasp' | 'groan' | 'laugh' | 'whistle' | 'clap' | 'shout' | 'roar';

export const REACTION_SOUNDS: Record<ReactionKind, readonly SoundId[]> = {
  cheer: ['crowd_cheer_1', 'crowd_cheer_2'],
  cheerBig: ['crowd_cheer_big'],
  ooh: ['crowd_ooh'],
  gasp: ['crowd_gasp'],
  groan: ['crowd_groan'],
  laugh: ['crowd_laugh'],
  whistle: ['crowd_whistle_1', 'crowd_whistle_2'],
  clap: ['crowd_clap'],
  shout: ['crowd_shout'],
  roar: ['crowd_roar'],
};

/** Minimum seconds between two reactions of the same kind. */
export const COOLDOWN: Record<ReactionKind, number> = {
  cheer: 2.2,
  cheerBig: 4,
  ooh: 2.4,
  gasp: 2.4,
  groan: 2.5,
  laugh: 2.5,
  whistle: 3,
  clap: 4,
  shout: 2,
  roar: 8,
};

export const GLOBAL_GAP = 0.45;
export const MAX_CONCURRENT = 3;
const BUSY_WINDOW = 1.2;

export interface ReactionRequest {
  kind: ReactionKind;
  /** 0..1 loudness/importance. */
  strength: number;
  /** Probability of reacting at all (default 1). */
  chance?: number;
  /** Seconds before the reaction starts (lets the effect that caused it be heard first). */
  delay?: number;
  /** Critical moment: ignore chance, spacing and cooldown. */
  force?: boolean;
}

export interface ReactionDirector {
  /** Returns true when a reaction was actually started. */
  react(req: ReactionRequest, now: number): boolean;
  setIntensity(level: number): void;
  reset(): void;
}

export interface ReactionOptions {
  /** Demote stadium roars/big cheers to quiet street cheers (default false). */
  street?: boolean;
}

export function createReactionDirector(
  mixer: Mixer,
  seed = 0xc20d,
  opts: ReactionOptions = {},
): ReactionDirector {
  const rand = createRand(seed);
  const lastKind = new Map<ReactionKind, number>();
  const lastVariant = new Map<ReactionKind, number>();
  /** Scheduled start time and end time of recent reactions (audio clock). */
  let recent: { start: number; end: number }[] = [];
  let intensity = 0;

  return {
    react(request, now) {
      let req = request;
      if (opts.street && (req.kind === 'roar' || req.kind === 'cheerBig')) {
        req = { ...req, kind: 'cheer', strength: req.strength * (req.kind === 'roar' ? 0.7 : 0.8) };
      }
      const { kind } = req;
      const start = now + (req.delay ?? 0);
      recent = recent.filter((r) => r.end > now - 1);
      const sounding = recent.filter((r) => r.start <= start && r.end > start).length;
      if (!req.force) {
        if (recent.some((r) => Math.abs(r.start - start) < GLOBAL_GAP)) return false;
        const prev = lastKind.get(kind);
        if (prev !== undefined && start - prev < COOLDOWN[kind]) return false;
        if (sounding >= MAX_CONCURRENT) return false;
        // chance 1 (or unspecified) is a sure thing; anything lower is a dice roll that gets less
        // likely right after another reaction and a bit more likely when the match is hot
        const chance = req.chance ?? 1;
        if (chance < 1) {
          const busy = recent.some((r) => start - r.start >= 0 && start - r.start < BUSY_WINDOW) ? 0.5 : 1;
          if (rand() > chance * busy * (0.85 + 0.3 * intensity)) return false;
        }
      } else if (sounding >= MAX_CONCURRENT + 1) {
        return false;
      }
      const pool = REACTION_SOUNDS[kind];
      let v = Math.floor(rand() * pool.length);
      if (pool.length > 1 && v === lastVariant.get(kind)) v = (v + 1) % pool.length;
      lastVariant.set(kind, v);
      const strength = Math.min(1, Math.max(0, req.strength));
      const gain = (0.45 + 0.55 * strength) * (0.8 + 0.2 * intensity) * (opts.street ? 0.8 : 1);
      const ok = mixer.play(pool[v]!, { gain, rate: 0.96 + rand() * 0.08, delay: req.delay ?? 0 });
      if (!ok) return false;
      lastKind.set(kind, start);
      recent.push({ start, end: start + 2.5 });
      return true;
    },
    setIntensity(level) {
      intensity = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    },
    reset() {
      lastKind.clear();
      lastVariant.clear();
      recent = [];
    },
  };
}
