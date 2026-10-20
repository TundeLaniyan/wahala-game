import { describe, expect, it } from 'vitest';
import type { Mixer, PlayOpts } from '../../src/audio/mixer';
import {
  COOLDOWN,
  GLOBAL_GAP,
  MAX_CONCURRENT,
  REACTION_SOUNDS,
  createReactionDirector,
} from '../../src/audio/reactions';
import type { SoundId } from '../../src/audio/recipes';
import { SOUND_IDS } from '../../src/audio/recipes';

function rig() {
  const played: { id: SoundId; o: PlayOpts }[] = [];
  const mixer: Mixer = {
    play: (id, o = {}) => {
      played.push({ id, o });
      return true;
    },
  };
  return { played, d: createReactionDirector(mixer) };
}

describe('reaction director', () => {
  it('maps every reaction kind to real crowd sounds', () => {
    for (const [kind, ids] of Object.entries(REACTION_SOUNDS)) {
      expect(ids.length, kind).toBeGreaterThan(0);
      for (const id of ids) expect(SOUND_IDS).toContain(id);
    }
  });

  it('a request with no chance always reacts; a chance of 0 never does', () => {
    const { d, played } = rig();
    expect(d.react({ kind: 'gasp', strength: 0.5 }, 0)).toBe(true);
    expect(d.react({ kind: 'groan', strength: 0.5, chance: 0 }, 5)).toBe(false);
    expect(played).toHaveLength(1);
  });

  it('enforces the global gap, per-kind cooldown and silence in between', () => {
    const { d, played } = rig();
    expect(d.react({ kind: 'ooh', strength: 1 }, 0)).toBe(true);
    expect(d.react({ kind: 'gasp', strength: 1 }, GLOBAL_GAP / 2)).toBe(false); // too soon after another reaction
    expect(d.react({ kind: 'gasp', strength: 1 }, GLOBAL_GAP + 0.01)).toBe(true);
    expect(d.react({ kind: 'ooh', strength: 1 }, 1.0)).toBe(false); // ooh cooldown
    expect(d.react({ kind: 'ooh', strength: 1 }, COOLDOWN.ooh + 0.1)).toBe(true);
    expect(played).toHaveLength(3);
  });

  it('delayed reactions are spaced by their start times, so "gasp then relief" is possible', () => {
    const { d, played } = rig();
    expect(d.react({ kind: 'gasp', strength: 1, delay: 0.2 }, 0)).toBe(true);
    expect(d.react({ kind: 'cheer', strength: 1, delay: 0.9 }, 0)).toBe(true);
    expect(d.react({ kind: 'laugh', strength: 1, delay: 1.0 }, 0)).toBe(false); // collides with the cheer start
    expect(played.map((p) => p.o.delay)).toEqual([0.2, 0.9]);
  });

  it('caps how many reactions sound at once, but critical ones may exceed it by one', () => {
    const { d } = rig();
    const kinds = ['cheer', 'ooh', 'gasp', 'laugh', 'shout'] as const;
    const results = kinds.map((k, i) => d.react({ kind: k, strength: 1, delay: i * 0.5 }, 0));
    expect(results.filter(Boolean)).toHaveLength(MAX_CONCURRENT);
    expect(d.react({ kind: 'roar', strength: 1, force: true, delay: 1.2 }, 0)).toBe(true);
  });

  it('force bypasses chance, gap and cooldown', () => {
    const { d, played } = rig();
    d.react({ kind: 'roar', strength: 1 }, 0);
    expect(d.react({ kind: 'roar', strength: 1, force: true }, 0.01)).toBe(true);
    expect(played).toHaveLength(2);
  });

  it('rotates variants and scales gain with strength and intensity', () => {
    const { d, played } = rig();
    d.react({ kind: 'cheer', strength: 1 }, 0);
    d.react({ kind: 'cheer', strength: 1 }, 10);
    expect(played[0]!.id).not.toBe(played[1]!.id);
    const weak = rig();
    weak.d.react({ kind: 'gasp', strength: 0.1 }, 0);
    const strong = rig();
    strong.d.react({ kind: 'gasp', strength: 1 }, 0);
    expect(strong.played[0]!.o.gain!).toBeGreaterThan(weak.played[0]!.o.gain!);
    const hot = rig();
    hot.d.setIntensity(1);
    hot.d.react({ kind: 'gasp', strength: 1 }, 0);
    expect(hot.played[0]!.o.gain!).toBeGreaterThan(strong.played[0]!.o.gain!);
  });

  it('dice rolls are seeded: a 50% chance reacts about half the time, and less often when the crowd is busy', () => {
    const run = (gap: number): number => {
      const { d, played } = rig();
      for (let i = 0; i < 400; i++) d.react({ kind: 'laugh', strength: 0.5, chance: 0.5 }, i * gap);
      return played.length;
    };
    const relaxed = run(10);
    expect(relaxed).toBeGreaterThan(130);
    expect(relaxed).toBeLessThan(270);
    expect(run(10)).toBe(relaxed); // deterministic
  });

  it('reset forgets cooldowns', () => {
    const { d } = rig();
    d.react({ kind: 'roar', strength: 1 }, 0);
    expect(d.react({ kind: 'roar', strength: 1 }, 1)).toBe(false);
    d.reset();
    expect(d.react({ kind: 'roar', strength: 1 }, 1)).toBe(true);
  });
});
