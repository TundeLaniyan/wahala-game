import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}

function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

const FRAMEWORKS = /^(three|react|react-dom|zustand)(\/|$)/;

describe('layering rules', () => {
  it('src/sim is pure: no frameworks, no outer layers, no browser globals or Math.random', () => {
    for (const f of files('src/sim')) {
      for (const i of imports(f)) {
        expect(FRAMEWORKS.test(i), `${f} imports ${i}`).toBe(false);
        expect(/\.\.\/(render|ui|audio|input|app|ai)(\/|$)/.test(i), `${f} imports ${i}`).toBe(false);
      }
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|\bdocument\.|\bwindow\./);
    }
  });

  it('src/ai only depends on the simulation', () => {
    for (const f of files('src/ai')) {
      for (const i of imports(f)) {
        expect(FRAMEWORKS.test(i), `${f} imports ${i}`).toBe(false);
        if (i.startsWith('..')) expect(/^\.\.\/sim(\/|$)/.test(i), `${f} imports ${i}`).toBe(true);
      }
    }
  });

  it('render, ui, audio and input never import each other except through shared assets and the sim', () => {
    const allowed: Record<string, RegExp> = {
      render: /^\.\.\/(\.\.\/)?(sim|assets)(\/|$)/,
      audio: /^\.\.\/(sim)(\/|$)/,
      input: /^\.\.\/sim(\/|$)/,
    };
    for (const [layer, rule] of Object.entries(allowed)) {
      for (const f of files(`src/${layer}`)) {
        for (const i of imports(f)) {
          if (!i.startsWith('../')) continue;
          const toOuter = /^(\.\.\/)+(render|ui|audio|input|app|ai)(\/|$)/.test(i);
          if (toOuter) expect(rule.test(i), `${f} imports ${i}`).toBe(true);
        }
      }
    }
  });

  it('game balance numbers live in config: systems do not hardcode fuse or range constants', () => {
    for (const f of files('src/sim/systems')) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/\b(180|7200)\b/);
    }
  });

  it('graphics quality is render-only: the sim, the bots and the input layer never see it', () => {
    for (const dir of ['src/sim', 'src/ai', 'src/input']) {
      for (const f of files(dir)) {
        const src = readFileSync(f, 'utf8');
        expect(src, f).not.toMatch(/render\/(quality|perf)|QualityProfile|QualitySetting|AdaptiveQuality/);
      }
    }
    // and the quality system itself imports nothing from the game's other layers
    for (const f of files('src/render/perf')) {
      for (const i of imports(f)) {
        if (i.startsWith('..')) expect(/^\.\.\/quality$/.test(i), `${f} imports ${i}`).toBe(true);
      }
    }
  });
});

describe('campaign enemy bots see only what perception allows (decision SA4)', () => {
  it('the bots never read hidden pickups or the RNG state, and the Observation carries neither', () => {
    for (const f of files('src/ai')) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/rngState|\.hidden\b|\bhidden\[/);
    }
    const observe = readFileSync('src/sim/observe.ts', 'utf8');
    const shape = observe.slice(
      observe.indexOf('export interface Observation'),
      observe.indexOf('export function observe'),
    );
    expect(shape).not.toMatch(/\bhidden\b|rngState/);
  });

  it('an enemy plays identically whatever lies unseen: hidden pickups, the RNG state, unseen generators', async () => {
    const { tacticsScene } = await import('../scripts/lib/sectorDrill');
    const { createBot } = await import('../src/ai');
    const { observe, tick } = await import('../src/sim');
    type Twist = 'none' | 'hidden' | 'rng' | 'unseenA' | 'unseenB';
    const play = (twist: Twist): string[] => {
      const { s } = tacticsScene({
        level: 'hard',
        seed: 9,
        human: [12, 8],
        enemies: [
          {
            variant: 'lieutenant',
            at: [2, 2],
            territory: {
              patrol: [
                [2, 2],
                [8, 2],
              ],
            },
          },
        ],
      });
      if (twist === 'hidden') s.hidden = { [3 * s.width + 3]: 'okada' } as never;
      if (twist === 'rng') s.rngState = (s.rngState ^ 0xdeadbeef) >>> 0;
      // a generator far out of every line of sight, in one corner or the other (never lit for 200 ticks)
      const corner = twist === 'unseenA' ? { x: 14, y: 10 } : twist === 'unseenB' ? { x: 0, y: 10 } : null;
      if (corner)
        s.generators.push({
          id: s.nextId++,
          ownerId: 0,
          x: corner.x,
          y: corner.y,
          stepFromX: corner.x,
          stepFromY: corner.y,
          range: 2,
          pierce: false,
          square: 0,
          fromSpectator: false,
          mode: 'timed',
          timer: 100000,
          carriedBy: null,
          carryBonusUsed: false,
          slide: null,
          flight: null,
          triggered: false,
          placedTick: -1000,
        });
      const bot = createBot({ difficulty: 'standard', seed: 4, playerId: 1 });
      const out: string[] = [];
      for (let i = 0; i < 200; i++) {
        const intent = bot.decide(observe(s, 1));
        out.push(JSON.stringify(intent));
        tick(s, { 1: intent });
      }
      return out;
    };
    const base = play('none');
    expect(play('hidden')).toEqual(base);
    expect(play('rng')).toEqual(base);
    expect(play('unseenA')).toEqual(base);
    expect(play('unseenB')).toEqual(base);
  });
});
