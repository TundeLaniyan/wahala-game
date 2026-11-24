/**
 * City Rumble Free-for-All AND Team Rumble online (approved requirement). The online match must use the SAME rules as
 * the offline game: the team split is the simulation's own `assignTeams`, damage is the simulation's `canHarm` /
 * `flameHarms` (decisions TB1-TB4, WD2: friendly fire exists only in Team Rumble and is OFF unless chosen).
 */
import { describe, expect, it } from 'vitest';
import { MSG, validateSettingsMsg } from '../../src/net/protocol';
import { CHARACTER_IDS, RUMBLE_ARENA_IDS, assignTeams, canHarm, flameHarms, getArena } from '../../src/sim';
import type { GameState } from '../../src/sim';
import { Lobby } from '../src/core/Lobby';
import { DEFAULT_RUNTIME, parseRoomOptions, parseSettingsPatch } from '../src/core/options';
import { RumbleMatch } from '../src/core/RumbleMatch';
import type { SeatSpec } from '../src/core/RumbleMatch';
import { MATCH_END_BUDGET_MS, TestContext, create, joinById, until } from './helpers';
import type { TestPlayer } from './helpers';

/** What the lobby hands the match for `humans` humans: humans first in join order, bots after, 32 in all. */
function seatsFor(humans: number): SeatSpec[] {
  const lobby = new Lobby(
    {
      maxHumans: 32,
      seats: 32,
      isPrivate: true,
      autoStartMs: 0,
      countdownMs: 0,
      settings: { arenaId: 'rumbleOshodi', game: 'team', durationSec: 180, botDifficulty: 'standard' },
    },
    () => 0,
  );
  for (let i = 0; i < humans; i++)
    lobby.join(`s${i}`, { name: `Player ${i}`, characterId: CHARACTER_IDS[0]! });
  lobby.start('s0');
  return lobby.begin();
}

function teamMatch(
  humans: number,
  arenaId: string,
  extra: { friendlyFire?: boolean; game?: 'team' | 'deathmatch' | 'survival' } = {},
) {
  return new RumbleMatch({
    matchId: `t-${humans}-${arenaId}`,
    arenaId,
    game: extra.game ?? 'team',
    durationSec: 180,
    friendlyFire: extra.friendlyFire,
    seats: seatsFor(humans),
    seed: 4242,
  });
}

describe('Team Rumble: balanced teams across humans and bots', () => {
  it.each([1, 2, 5, 17, 32])(
    '%i human(s) + bots: 16 v 16 in all, humans spread across both sides (no stacked team)',
    (humans) => {
      for (const arenaId of RUMBLE_ARENA_IDS) {
        const match = teamMatch(humans, arenaId);
        const players = match.descriptor.players;
        expect(players).toHaveLength(32);
        const teamOf = (i: number): number => players[i]!.team ?? -1;
        const all = [0, 0];
        const people = [0, 0];
        const bots = [0, 0];
        players.forEach((_p, i) => {
          const t = teamOf(i);
          expect([0, 1]).toContain(t); // everybody is on a team
          all[t]!++;
          (i < humans ? people : bots)[t]!++;
        });
        expect(all, `${arenaId} total`).toEqual([16, 16]);
        expect(Math.abs(people[0]! - people[1]!), `${arenaId} humans ${people}`).toBeLessThanOrEqual(1);
        expect(Math.abs(bots[0]! - bots[1]!), `${arenaId} bots ${bots}`).toBeLessThanOrEqual(1);
      }
    },
  );

  it("the server uses the simulation's own team assignment, not a copy of it", () => {
    for (const humans of [1, 5, 17]) {
      const match = teamMatch(humans, 'rumbleLekki');
      const expected = assignTeams(
        { ...match.state.settings, game: 'team', teamCount: 2 },
        getArena('rumbleLekki'),
        32,
      );
      expect(match.descriptor.players.map((p) => p.team)).toEqual(expected);
      expect(match.state.players.map((p) => p.team)).toEqual(expected);
    }
  });

  it('Free-for-All has no teams at all, in both FFA modes', () => {
    for (const game of ['deathmatch', 'survival'] as const) {
      const match = teamMatch(5, 'rumbleOshodi', { game });
      expect(match.descriptor.players.every((p) => p.team === -1)).toBe(true);
      expect(match.descriptor.settings.game).toBe(game);
    }
  });
});

describe('Team Rumble: friendly fire is the offline rule (off by default, host can switch it on)', () => {
  const rivalsAndMates = (state: GameState) => {
    const me = state.players[0]!;
    const mate = state.players.find((p) => p.id !== 0 && p.team === me.team)!;
    const rival = state.players.find((p) => p.team !== me.team)!;
    return { me, mate, rival };
  };

  it("OFF (the default): a teammate's blast does not harm, a rival's and your own do", () => {
    const match = teamMatch(2, 'rumbleOshodi');
    expect(match.descriptor.settings.friendlyFire).toBe(false);
    const { me, mate, rival } = rivalsAndMates(match.state);
    expect(canHarm(match.state, mate.id, me)).toBe(false);
    expect(flameHarms(match.state, { ownerId: mate.id }, me)).toBe(false);
    expect(canHarm(match.state, rival.id, me)).toBe(true);
    expect(canHarm(match.state, me.id, me)).toBe(true);
  });

  it("ON: the same sim rule lets a teammate's blast harm, and the clients are told (descriptor)", () => {
    const match = teamMatch(2, 'rumbleOshodi', { friendlyFire: true });
    expect(match.descriptor.settings.friendlyFire).toBe(true);
    const { me, mate } = rivalsAndMates(match.state);
    expect(canHarm(match.state, mate.id, me)).toBe(true);
    expect(flameHarms(match.state, { ownerId: mate.id }, me)).toBe(true);
  });

  it('friendly fire never exists outside Team Rumble, even if asked for', () => {
    const match = teamMatch(2, 'rumbleOshodi', { game: 'deathmatch', friendlyFire: true });
    expect(match.descriptor.settings.friendlyFire).toBe(false);
  });

  it('the host asks for it with the settings message; anything but a boolean is refused', () => {
    expect(validateSettingsMsg({ friendlyFire: true })).toEqual({ friendlyFire: true });
    expect(validateSettingsMsg({ game: 'team', friendlyFire: false })).toEqual({
      game: 'team',
      friendlyFire: false,
    });
    expect(validateSettingsMsg({ friendlyFire: 'yes' })).toBeNull();
    expect(validateSettingsMsg({ friendlyFire: 1 })).toBeNull();
    expect(parseSettingsPatch({ friendlyFire: true }, DEFAULT_RUNTIME)).toEqual({
      ok: true,
      value: { friendlyFire: true },
    });
    expect(parseSettingsPatch({ friendlyFire: 'on' }, DEFAULT_RUNTIME).ok).toBe(false);
    const created = parseRoomOptions({ private: true, game: 'team', friendlyFire: true }, DEFAULT_RUNTIME);
    expect(created.ok && created.value.settings).toMatchObject({ game: 'team', friendlyFire: true });
  });
});

describe('Team Rumble over real sockets: lobby, descriptor and results carry the teams', () => {
  const ctx = new TestContext();

  it('2 humans + 30 bots on teams: friendly fire switch reaches the match, 16 v 16, results name teams and a winner or a draw', async () => {
    const { all, code } = await ctx.privateMatch(['Ada', 'Bayo'], { game: 'team', durationSec: 10 });
    const [a, b] = all as [TestPlayer, TestPlayer];
    expect(a.lobby!.settings).toMatchObject({ game: 'team', friendlyFire: false });
    const players = a.welcomes.at(-1)!.descriptor!.players;
    expect(players.filter((p) => p.team === 0)).toHaveLength(16);
    expect(players.filter((p) => p.team === 1)).toHaveLength(16);
    expect(players[0]!.team).not.toBe(players[1]!.team); // two friends do not start stacked on one side
    expect(a.welcomes.at(-1)!.descriptor!.settings).toMatchObject({ game: 'team', friendlyFire: false });
    await until('results', () => a.results.length > 0 && b.results.length > 0, MATCH_END_BUDGET_MS);
    const r = a.results[0]!;
    expect(r).toEqual(b.results[0]);
    expect(r.players.every((p) => p.team === 0 || p.team === 1)).toBe(true);
    expect(r.players.filter((p) => p.team === 0)).toHaveLength(16);
    expect(r.winnerSeat).toBeNull(); // a team match is won by a team
    if (r.draw) expect(r.winnerTeam).toBeNull();
    else expect([0, 1]).toContain(r.winnerTeam);
    expect(ctx.metricsOf(code).matches.finished).toBe(1);
  });

  it('the host can switch friendly fire on in the lobby; a guest cannot', async () => {
    const host = ctx.track(await create(ctx.server, 'Ada', { private: true, game: 'team', durationSec: 10 }));
    const guest = ctx.track(await joinById(ctx.server, host.room.roomId, 'Bayo'));
    await until('both in', () => host.lobby?.members.length === 2 && guest.lobby?.members.length === 2);
    guest.room.send(MSG.settings, { friendlyFire: true });
    await until('refused', () => guest.notices.length === 1);
    expect(guest.notices[0]!.code).toBe('not_host');
    host.room.send(MSG.settings, { friendlyFire: true });
    await until('applied', () => guest.lobby?.settings.friendlyFire === true);
    host.room.send(MSG.start);
    await until('match', () => host.seat !== null && host.keyframes >= 1);
    expect(host.welcomes.at(-1)!.descriptor!.settings.friendlyFire).toBe(true);
  });
});
