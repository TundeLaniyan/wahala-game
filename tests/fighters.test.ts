/**
 * Fighter definitions (decision FC5): every fighter is fully described and consistent with the simulation's own
 * data; the three experimental fighters are data only and stay hidden unless the `experimentalContent` flag is on.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { FLAG_DEFAULTS, flags, setFlagsForTests } from '../src/platform/flags';
import {
  ARENAS,
  ATTACK_KINDS,
  CHARACTERS,
  CHARACTER_IDS,
  DEFAULT_CONFIG,
  createGame,
  defaultAttacks,
  fighterRoster,
  getFighter,
  isFighterId,
  loadoutOf,
} from '../src/sim';
import type { FighterId } from '../src/sim';

const manifest = JSON.parse(readFileSync('public/audio/music/manifest.json', 'utf8')) as {
  playlists: { arenas: Record<string, unknown> };
};

afterEach(() => setFlagsForTests(null));

const ALL: FighterId[] = fighterRoster(true).map((f) => f.id);

describe('the roster', () => {
  it('the default build lists exactly the three playable fighters, in the character registry order', () => {
    expect(fighterRoster().map((f) => f.id)).toEqual(CHARACTER_IDS);
    expect(fighterRoster(false)).toHaveLength(3);
    expect(fighterRoster().every((f) => f.status === 'playable')).toBe(true);
  });

  it('three more fighters exist as experimental data, hidden by default and never playable characters', () => {
    const exp = fighterRoster(true).filter((f) => f.status === 'experimental');
    expect(exp).toHaveLength(3);
    for (const f of exp) {
      expect(CHARACTER_IDS).not.toContain(f.id);
      expect(f.id in CHARACTERS).toBe(false); // not selectable: the menu reads CHARACTERS
      expect(CHARACTER_IDS).toContain(f.rig); // they reuse an existing rig
      expect(fighterRoster(false).map((x) => x.id)).not.toContain(f.id);
    }
    // an experimental id is refused by the game (it falls back to the default rig) - nothing can start one
    const s = createGame({
      seed: 1,
      players: [
        { name: 'a', characterId: exp[0]!.id as never, isBot: false },
        { name: 'b', characterId: 'lekkiBoy', isBot: false },
      ],
    });
    expect(s.players[0]!.characterId).toBe('streetBaller');
  });

  it('the experimentalContent flag decides what a menu would list', () => {
    expect(FLAG_DEFAULTS.experimentalContent).toBe(false);
    setFlagsForTests({ ...FLAG_DEFAULTS });
    expect(fighterRoster(flags().experimentalContent)).toHaveLength(3);
    setFlagsForTests({ ...FLAG_DEFAULTS, experimentalContent: true });
    expect(fighterRoster(flags().experimentalContent)).toHaveLength(6);
  });

  it('getFighter and isFighterId cover every id', () => {
    for (const id of ALL) {
      expect(getFighter(id).id).toBe(id);
      expect(isFighterId(id)).toBe(true);
    }
    expect(isFighterId('nobody')).toBe(false);
  });
});

describe('every fighter is completely defined', () => {
  it.each(ALL)('%s', (id) => {
    const f = getFighter(id);
    const text = (s: string): void => {
      expect(s.trim().length).toBeGreaterThan(2);
      expect(s).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u); // no emoji
    };
    text(f.name);
    text(f.tagline);
    text(f.appearance.description);
    text(f.appearance.culturalStyling);
    expect(f.appearance.accessories.length).toBeGreaterThan(0);
    // movement: read from the config, never an invented stat
    expect(f.movement.baseStepTicks).toBe(DEFAULT_CONFIG.movement.stepTicksBySpeedLevel[0]);
    expect(f.movement.wired).toBe('sim');
    // attacks exist in the catalogue
    expect(ATTACK_KINDS).toContain(f.primaryAttack);
    if (f.secondaryAttack) expect(ATTACK_KINDS).toContain(f.secondaryAttack);
    expect(f.secondaryAttack).not.toBe(f.primaryAttack);
    for (const t of [f.specialAbility, f.passiveTrait]) {
      text(t.name);
      text(t.description);
      expect(['sim', 'proposal']).toContain(t.wired);
    }
    // voice / personality: short Pidgin lines as text, no audio reference
    for (const line of Object.values(f.personality.lines)) {
      text(line);
      expect(line.length).toBeLessThanOrEqual(48);
    }
    expect(Object.keys(f.personality.lines).sort()).toEqual(['hit', 'hurt', 'intro', 'lose', 'taunt', 'win']);
    text(f.introduction.title);
    text(f.introduction.text);
    // an existing stage and an existing soundtrack slot (no music is added)
    expect(ARENAS[f.stage], `stage ${f.stage}`).toBeDefined();
    expect(f.soundtrack).toBe(`arena:${f.stage}`);
    expect(manifest.playlists.arenas[f.stage], `soundtrack of ${f.stage}`).toBeDefined();
    expect(f.costumes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(f.costumes.map((c) => c.id)).size).toBe(f.costumes.length);
    expect(f.finisher).toMatch(/^finisher\.[A-Za-z]+\.[A-Za-z]+$/);
    expect(JSON.stringify(f)).not.toMatch(/\.(mp3|wav|ogg)|tts|voice_/i); // no audio in fighter data
  });
});

describe('the playable fighters match the simulation', () => {
  it.each(CHARACTER_IDS)('%s', (id) => {
    const f = getFighter(id);
    expect(f.status).toBe('playable');
    expect(f.rig).toBe(id);
    expect(f.name).toBe(CHARACTERS[id].name);
    expect(f.tagline).toBe(CHARACTERS[id].tagline);
    expect(f.primaryAttack).toBe(CHARACTERS[id].skill);
    // the deployed game: the primary only; the secondary behind the config switch
    expect(defaultAttacks(id, false)).toEqual({ primary: CHARACTERS[id].skill, secondary: null });
    expect(defaultAttacks(id, true).secondary).toBe(f.secondaryAttack);
    // the passive trait is the config's signature contact tool
    const tool = DEFAULT_CONFIG.rewards.contactByCharacter[id];
    expect(f.passiveTrait.wired).toBe('sim');
    expect(f.passiveTrait.description.toLowerCase()).toContain(
      { boots: 'football boots', gloves: 'mechanic gloves', killswitch: 'kill switch' }[tool as string]!,
    );
  });

  it('players get their fighter loadout from the definition, and a setup can override it', () => {
    const s = createGame({
      seed: 3,
      players: [
        { name: 'a', characterId: 'campusQueen', isBot: false },
        {
          name: 'b',
          characterId: 'lekkiBoy',
          isBot: false,
          attacks: { primary: 'headbutt', secondary: 'elbow' },
        },
      ],
    });
    expect(loadoutOf(s.players[0]!, s.config)).toEqual({ primary: 'shove', secondary: null });
    expect(loadoutOf(s.players[1]!, s.config)).toEqual({ primary: 'headbutt', secondary: 'elbow' });
  });

  it('three fighters, three different primary attacks and three different secondaries', () => {
    const f = CHARACTER_IDS.map(getFighter);
    expect(new Set(f.map((x) => x.primaryAttack)).size).toBe(3);
    expect(new Set(f.map((x) => x.secondaryAttack)).size).toBe(3);
  });
});
