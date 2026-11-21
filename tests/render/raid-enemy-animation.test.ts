/**
 * Integration of the Classic raid AI (RA1-RA7) with the dedicated enemy models (docs/CHARACTER_PRODUCTION_ROSTER.md):
 * the models pick their clip from the territory mind the raid AI now keeps (`mindOf`: patrol / watch / return walk,
 * a chase runs) and play `Alert` on an `enemyCue`. Before the raid AI, raids had no minds, so every raid enemy ran
 * and never alerted. This pins that a raid enemy patrols calmly (a Walk) and that noticing the fighter is a cue.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from '../../src/ai';
import { buildRaidGame, createGame, observe, tick } from '../../src/sim';
import type { GameState, Intents, SimEvent } from '../../src/sim';
import { mindOf } from '../../src/render/views/enemyAwareness';
import { knockOut, letWavesAppear, put } from '../raid-helpers';

function depot(): GameState {
  const s = createGame(
    buildRaidGame({
      raidId: 'warehouseDispatchDepot',
      humanCharacter: 'streetBaller',
      seed: 3,
      level: 'normal',
    }),
  );
  s.match.phase = 'playing';
  s.match.countdownRemaining = 0;
  letWavesAppear(s);
  knockOut(s, ...s.players.filter((p) => p.id > 1 && p.alive).map((p) => p.id));
  return s;
}

describe('raid enemies drive the dedicated models’ clips', () => {
  it('a guard on its route is calm (Walk), and noticing the fighter emits an alert cue (Alert)', () => {
    const s = depot();
    put(s, 0, 1, 11); // the human parked at the entrance, out of sight
    const bot = createBot({ difficulty: 'casual', seed: 77, playerId: 1 });
    const minds = new Set<string>();
    const cues: string[] = [];
    let walkedCalm = 0;
    for (let i = 0; i < 900; i++) {
      const before = { x: s.players[1]!.x, y: s.players[1]!.y };
      const intents: Intents = { 0: {} };
      intents[1] = bot.decide(observe(s, 1));
      const events: SimEvent[] = tick(s, intents);
      for (const e of events) if (e.type === 'enemyCue' && e.playerId === 1) cues.push(e.cue);
      const m = mindOf(s, 1);
      if (m) minds.add(m);
      const moved = s.players[1]!.x !== before.x || s.players[1]!.y !== before.y;
      if (moved && (m === 'patrol' || m === 'watch' || m === 'return')) walkedCalm++;
      // halfway, step the human into the guard's path so it notices him
      if (i === 450)
        put(
          s,
          0,
          s.players[1]!.x,
          s.players[1]!.y + 1 < s.height - 1 ? s.players[1]!.y + 1 : s.players[1]!.y - 1,
        );
    }
    expect(mindOf(s, 1) ?? [...minds][0], 'a raid seat has a territory mind').toBeDefined();
    expect(minds.has('patrol')).toBe(true);
    expect(walkedCalm, 'calm route steps (drawn with Walk)').toBeGreaterThan(5);
    expect(cues, 'noticing the fighter is an alert cue (drawn with Alert)').toContain('alert');
  });
});
