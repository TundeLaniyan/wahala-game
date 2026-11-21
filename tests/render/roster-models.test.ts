/**
 * The 18-character roster (docs/CHARACTER_PRODUCTION_ROSTER.md): every model file exists where the game looks for it, shares the
 * hero cast's 22-bone skeleton, carries the clips its role needs, stays inside the mobile budgets, and every enemy variant /
 * boss name maps to a file. Headless: the GLB JSON is read in Node, no WebGL.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOSS_MODELS, ENEMY_LOOKS, dedicatedModelOf } from '../../src/assets/enemyLooks';

const MODELS = new URL('../../src/assets/models/', import.meta.url);
const LAZY = new URL('lazy/', MODELS);

interface Glb {
  skins: { joints: number[] }[];
  nodes: { name?: string; extras?: Record<string, unknown> }[];
  meshes: { primitives: { indices: number }[] }[];
  accessors: { count: number }[];
  materials: unknown[];
  textures?: unknown[];
  animations: { name: string }[];
}

function read(dir: URL, file: string): { json: Glb; bytes: number } {
  const buf = readFileSync(new URL(file, dir));
  const len = buf.readUInt32LE(12);
  return { json: JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as Glb, bytes: buf.length };
}

const bones = (g: Glb): string[] => g.skins[0]!.joints.map((j) => g.nodes[j]!.name!);
const tris = (g: Glb): number =>
  g.meshes.reduce((n, m) => n + m.primitives.reduce((k, p) => k + g.accessors[p.indices]!.count / 3, 0), 0);

const HEROES = ['streetBaller', 'campusQueen', 'lekkiBoy'];
const ENEMIES = Object.values(ENEMY_LOOKS)
  .map((l) => l.model)
  .filter((m): m is NonNullable<typeof m> => !!m);
const BOSSES = Object.values(BOSS_MODELS);
const SKELETON = bones(
  read(new URL('../../src/assets/legacy-models/', import.meta.url), 'char_streetBaller_v1.glb').json,
);

const FIGHTER_CLIPS = [
  'Idle',
  'Run',
  'Place',
  'Kick',
  'Throw',
  'Push',
  'Stumble',
  'Dazed',
  'DieBlast',
  'DieVehicle',
  'Win',
  'Lose',
  'Ride',
];
const ENEMY_CLIPS = [
  'Idle',
  'Walk',
  'Run',
  'Windup',
  'Strike',
  'Alert',
  'Push',
  'Stumble',
  'Dazed',
  'DieBlast',
  'DieVehicle',
];

describe.each([
  ...HEROES.map((id) => ({ id, dir: MODELS, clips: FIGHTER_CLIPS })),
  ...ENEMIES.map((id) => ({ id, dir: LAZY, clips: ENEMY_CLIPS })),
  ...BOSSES.map((id) => ({ id, dir: LAZY, clips: FIGHTER_CLIPS })),
])('character model $id', ({ id, dir, clips }) => {
  const m = read(dir, `char_${id}.glb`);

  it('shares the hero cast skeleton (every existing clip, the head rule and the rig conventions apply)', () => {
    expect(bones(m.json)).toEqual(SKELETON);
  });

  it('carries the clips its role needs', () => {
    const names = m.json.animations.map((a) => a.name);
    for (const c of clips) expect(names, c).toContain(c);
  });

  it('stays inside the mobile budget (triangles, materials, textures, size) and declares its head scale and fit', () => {
    expect(tris(m.json)).toBeLessThanOrEqual(28_000);
    expect(m.json.materials.length).toBeLessThanOrEqual(8);
    expect((m.json.textures ?? []).length).toBeLessThanOrEqual(4);
    expect(m.bytes).toBeLessThan(1.8 * 1024 * 1024);
    const head = m.json.nodes.find((n) => n.name === 'head');
    expect(head?.extras?.headScale).toBeGreaterThan(0.8);
    expect(head?.extras?.headFit).toBeTruthy();
  });
});

describe('roster wiring', () => {
  it('every lazily loaded model file is an enemy or a boss model, and every one of those has a file', () => {
    const files = readdirSync(LAZY)
      .filter((f) => f.endsWith('.glb'))
      .map((f) => f.replace(/^char_|\.glb$/g, ''))
      .sort();
    expect(files).toEqual([...ENEMIES, ...BOSSES].sort());
  });

  it('the three heroes are in the eager set; the previous hero models are kept outside the bundle for rollback', () => {
    const eager = readdirSync(MODELS).filter((f) => /^char_.*\.glb$/.test(f));
    for (const h of HEROES) expect(eager).toContain(`char_${h}.glb`);
    expect(readdirSync(new URL('../../src/assets/legacy-models/', import.meta.url))).toHaveLength(3);
  });

  it('boss names map to their model (presentation only) and a plain seat with the same look keeps its variant model', () => {
    expect(dedicatedModelOf({ name: 'Oga Sunmola' })).toBe('bossOgaSunmola');
    expect(dedicatedModelOf({ name: 'The Landlord', enemyVariant: 'boss' })).toBe('bossTheLandlord');
    expect(dedicatedModelOf({ name: 'Park Warden', enemyKind: 'agbero', enemyVariant: 'agbero' })).toBe(
      'agbero',
    );
    expect(dedicatedModelOf({ name: 'You' })).toBeNull();
  });
});
