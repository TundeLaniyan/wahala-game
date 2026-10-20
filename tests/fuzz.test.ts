import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  DIRS,
  createGame,
  createRng,
  listEntries,
  listKekeTurns,
  nextFloat,
  nextInt,
  tick,
  tileAt,
  Tile,
} from '../src/sim';
import type { GameState, Intent, Intents, PickupKind } from '../src/sim';

const GIFTS: PickupKind[] = [
  'petrol',
  'socket',
  'skates',
  'boots',
  'gloves',
  'grip',
  'remote',
  'killswitch',
  'okada',
  'voucher',
  'sneakers',
  'hotfuel',
  'curse',
  'diesel',
];

function randomIntent(state: GameState, id: number, rng: ReturnType<typeof createRng>): Intent {
  const intent: Intent = { move: nextFloat(rng) < 0.85 ? DIRS[nextInt(rng, 4)]! : null };
  const r = nextFloat(rng);
  if (r < 0.06) intent.place = true;
  else if (r < 0.09) intent.action = true;
  else if (r < 0.11) intent.skill = true;
  else if (r < 0.12) intent.detonate = true;
  else if (r < 0.13) intent.disarm = true;
  else if (r < 0.15) intent.vehicle = { type: 'begin' };
  const p = state.players[id]!;
  if (p.entryUntil !== null && nextFloat(rng) < 0.1) {
    const kind = state.config.vehicles.specs;
    const vk = ['danfo', 'taxi', 'keke'].find(
      (k) => k === ['danfo', 'taxi', 'keke'][CHARACTER_IDS.indexOf(p.characterId)],
    )!;
    const entries = listEntries(state, vk as 'danfo');
    const entry = entries[nextInt(rng, entries.length)];
    if (entry) {
      const turns = kind[vk as 'keke'].turns ? listKekeTurns(state, entry) : [];
      intent.vehicle = { type: 'launch', entry, turn: turns[nextInt(rng, Math.max(1, turns.length))] };
    }
  }
  return intent;
}

function checkInvariants(s: GameState): void {
  const seen = new Set<string>();
  for (const g of s.generators) {
    expect(Number.isFinite(g.timer)).toBe(true);
    if (g.carriedBy === null && g.flight === null) {
      expect(tileAt(s, g.x, g.y)).toBe(Tile.Empty);
      const key = `${g.x},${g.y}`;
      expect(seen.has(key), `two grounded generators on ${key}`).toBe(false);
      seen.add(key);
    }
  }
  for (const p of s.players) {
    if (p.alive) expect(tileAt(s, p.x, p.y), `player ${p.id} inside a wall`).not.toBe(Tile.Hard);
    expect(p.range).toBeGreaterThanOrEqual(1);
    expect(p.capacity).toBeGreaterThanOrEqual(1);
    expect(p.killSwitchCharges).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    if (p.carrying !== null)
      expect(s.generators.some((g) => g.id === p.carrying && g.carriedBy === p.id)).toBe(true);
  }
  for (const f of s.flames) expect(tileAt(s, f.x, f.y)).not.toBe(Tile.Hard);
  for (const u of s.pickups) expect(tileAt(s, u.x, u.y)).not.toBe(Tile.Hard);
  for (const v of s.vehicles) {
    if (v.phase !== 'warning') {
      expect(v.index).toBeGreaterThanOrEqual(0);
      expect(v.index).toBeLessThan(v.route.length);
    }
    expect(v.damage).toBeGreaterThanOrEqual(0);
  }
  const alive = s.players.filter((p) => p.alive).length;
  if (s.match.phase === 'ended' && s.match.result?.kind === 'win') expect(alive).toBeGreaterThanOrEqual(1);
}

function play(seed: number, opts: { mode: 'classic' | 'crush'; crowd: boolean; arena: string }): GameState {
  const rng = createRng(seed * 31 + 7);
  const state = createGame({
    seed,
    arenaId: opts.arena,
    players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, characterId: CHARACTER_IDS[i % 3]!, isBot: i > 0 })),
    settings: { mode: opts.mode, crowdThrows: opts.crowd, floorHazards: opts.arena === 'lekkiRoadworks' },
  });
  for (let t = 0; t < 4200 && state.match.phase !== 'ended'; t++) {
    const intents: Intents = {};
    for (const p of state.players) if (p.alive) intents[p.id] = randomIntent(state, p.id, rng);
    if (t % 240 === 120) {
      const p = state.players[nextInt(rng, 4)]!;
      state.pickups.push({
        id: state.nextId++,
        x: p.x,
        y: p.y,
        kind: GIFTS[nextInt(rng, GIFTS.length)]!,
        safeEventId: null,
      });
    }
    tick(state, intents);
    checkInvariants(state);
  }
  return state;
}

describe('fuzz: random play never breaks simulation invariants', () => {
  for (const [mode, crowd, arena] of [
    ['classic', false, 'danfoBusPark'],
    ['crush', true, 'lekkiRoadworks'],
  ] as const) {
    it(`${mode} / ${arena}: 40 random seeded matches`, () => {
      let ended = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = play(seed, { mode, crowd, arena });
        if (s.match.phase === 'ended') ended++;
      }
      expect(ended).toBeGreaterThan(5);
    }, 120_000);
  }

  it('is deterministic: the same seed and inputs reproduce the exact same final state', () => {
    const a = play(5, { mode: 'classic', crowd: true, arena: 'danfoBusPark' });
    const b = play(5, { mode: 'classic', crowd: true, arena: 'danfoBusPark' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
