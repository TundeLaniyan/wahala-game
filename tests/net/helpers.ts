import { RumbleMatch } from '../../server/src/core/RumbleMatch';
import type { RumbleMatchOptions, SeatSpec } from '../../server/src/core/RumbleMatch';
import { NetReplica } from '../../src/net/replica';
import type { FramesPayload, InputMsg, KeyframePayload } from '../../src/net/protocol';
import { canonicalClone, pack, unpack } from '../../src/net/pack';
import { CHARACTER_IDS, RUMBLE_ARENA_IDS } from '../../src/sim';
import type { Dir } from '../../src/sim';

export const ARENA = 'rumbleOshodi';

/** mulberry32: a tiny seeded PRNG (the tests never use Math.random). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seats(humans: number, bots: number): SeatSpec[] {
  const out: SeatSpec[] = [];
  for (let i = 0; i < humans + bots; i++) {
    out.push({
      name: i < humans ? `Human${i}` : `Bot${i}`,
      characterId: CHARACTER_IDS[i % CHARACTER_IDS.length]!,
      kind: i < humans ? 'human' : 'bot',
    });
  }
  return out;
}

export function makeMatch(
  over: Partial<RumbleMatchOptions> & { humans?: number; bots?: number } = {},
): RumbleMatch {
  const { humans = 2, bots = 30, ...rest } = over;
  if (!RUMBLE_ARENA_IDS.includes(ARENA)) throw new Error('arena missing');
  const m = new RumbleMatch({
    matchId: 'm-test',
    arenaId: ARENA,
    game: 'deathmatch',
    durationSec: 30,
    seats: seats(humans, bots),
    seed: 4242,
    ...rest,
  });
  for (let i = 0; i < humans; i++) m.connect(i);
  return m;
}

const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

/** Deterministic scripted human behaviour: a new input every 20 ticks per seat. */
export function driveHumans(m: RumbleMatch, seatList: number[], seqs: number[], tickNo: number): void {
  if (tickNo % 20 !== 0) return;
  const nowMs = (tickNo * 1000) / 60;
  for (const seat of seatList) {
    const k = tickNo / 20 + seat * 3;
    const msg: InputMsg = {
      s: ++seqs[seat]!,
      m: k % 5 === 4 ? null : DIRS[k % 4]!,
      h: false,
      b: k % 3 === 0 ? 1 : k % 7 === 0 ? 2 : 0,
    };
    m.input(seat, msg, nowMs);
  }
}

export function runMatch(
  m: RumbleMatch,
  ticks: number,
  opts: { humans?: number[]; onFlush?: (bytes: Uint8Array, tickNo: number) => void; startTick?: number } = {},
): void {
  const humans = opts.humans ?? [0, 1];
  const seqs = humans.map(() => 0);
  for (let t = opts.startTick ?? 0; t < (opts.startTick ?? 0) + ticks && !m.ended; t++) {
    driveHumans(m, humans, seqs, t);
    m.step();
    const bytes = m.flush();
    if (bytes) opts.onFlush?.(bytes, t);
  }
}

export const decodeFrames = (b: Uint8Array): FramesPayload => unpack(b) as FramesPayload;
export const wireKeyframe = (m: RumbleMatch): KeyframePayload =>
  unpack(pack(m.keyframe())) as KeyframePayload;

export function makeReplica(m: RumbleMatch): NetReplica {
  const r = new NetReplica(canonicalClone(m.descriptor));
  r.loadKeyframe(wireKeyframe(m));
  return r;
}
