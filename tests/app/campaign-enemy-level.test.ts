/**
 * Decision EF7 regression: the "boss is never easier than Standard" floor of `MatchController.startMission` applies to a
 * boss mission's seat 1 only. In a field mission seat 1 is an ordinary campaign enemy and plays at the level the save
 * asks for, like every other enemy of the mission (it used to be lifted to Standard alone).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/session', () => ({
  commands: new Proxy({}, { get: () => () => undefined }),
  liveMatch: () => null,
}));
import { MatchController } from '../../src/app/MatchController';
import type { BotFactory, InputPort, RendererPort } from '../../src/app/ports';
import { buildMissionGame } from '../../src/sim';
import type { Difficulty } from '../../src/sim';

const renderer = {
  loadGame() {},
  handleEvents() {},
  render() {},
  pickEntry: () => null,
  setQuality() {},
} as unknown as RendererPort;
const input: InputPort = { navMode: false, pollDevices() {}, buildIntent: () => ({}), clear() {} };

function levels(spec: Parameters<typeof buildMissionGame>[0]['spec']): Map<number, Difficulty> {
  const out = new Map<number, Difficulty>();
  const botFactory: BotFactory = ({ difficulty, playerId }) => {
    out.set(playerId, difficulty);
    return { decide: () => ({}) };
  };
  const m = new MatchController({ renderer, input, botFactory });
  m.startMission(buildMissionGame({ spec, humanCharacter: 'streetBaller', seed: 7 }), {
    missionId: 'oshodi',
    difficulty: 'rookie',
    onEnd: () => undefined,
  });
  return out;
}

describe('campaign enemy levels', () => {
  it('a field mission: every enemy, seat 1 included, plays at the save level', () => {
    const got = levels({ id: 'oshodi', fieldId: 'oshodi.approach', difficulty: 'rookie' });
    expect(got.size).toBeGreaterThan(1);
    expect([...got.values()].every((d) => d === 'rookie')).toBe(true);
  });

  it('a boss mission: the boss (seat 1) is still at least Standard', () => {
    const got = levels({ id: 'oshodi', difficulty: 'rookie' });
    expect(got.get(1)).toBe('standard');
  });
});
