/**
 * The three founder-approved boss presentations (docs/BOSS_INSPIRATIONS.md): Oshodi, Fadeyi and the Ojuelegba local
 * figure. Presentation changed (nickname, title, look, entourage, entrance, voice); the combat mechanics, ids and
 * progression did not. Real names never appear in the content (the broader denylist is in campaign-content.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/campaign';
import { CHARACTER_IDS } from '../src/sim';

const text = (v: unknown): string => JSON.stringify(v).toLowerCase();

describe('approved boss presentations', () => {
  const oshodi = CAMPAIGN.districts.oshodi.boss!;
  const fadeyi = CAMPAIGN.districts.fadeyiSomolu.boss!;
  const fig = CAMPAIGN.districts.ojuelegba.figure!;

  it('keep the ids, mechanics, phases and rewards (progression untouched)', () => {
    expect([oshodi.id, oshodi.objectiveKind, oshodi.signatureAbility.name]).toEqual([
      'ogaSunmola',
      'dispatchRelays',
      'Open Lines',
    ]);
    expect([fadeyi.id, fadeyi.objectiveKind, fadeyi.signatureAbility.name]).toEqual([
      'marshalKobo',
      'junctionAccess',
      'Right of Way',
    ]);
    expect(oshodi.phases).toHaveLength(3);
    expect(fadeyi.phases).toHaveLength(3);
    expect(oshodi.reward.unlocks).toContain('district.mushin');
    expect(fadeyi.reward.unlocks).toContain('district.ebuteMetta');
  });

  it('carry a distinct local identity: nickname, title, entourage, entrance, look and a voice', () => {
    for (const b of [oshodi, fadeyi]) {
      expect(b.nickname, b.id).toBeTruthy();
      expect(b.entourage!.length, b.id).toBeGreaterThan(60);
      expect(b.entrance!.length, b.id).toBeGreaterThan(40);
      expect(b.visualDirection.description.length).toBeGreaterThan(120);
      expect(b.introduction.length).toBeGreaterThanOrEqual(6);
    }
    expect(oshodi.title).toBe('Park Master of the Interchange');
    expect(oshodi.nickname).toBe('Oga Mic');
    expect(fadeyi.title).toContain('Garage Master');
    expect(oshodi.title).not.toBe(fadeyi.title);
    expect(oshodi.visualDirection.palette.primary).not.toBe(fadeyi.visualDirection.palette.primary);
    expect(oshodi.introduction.map((l) => l.text).join(' ')).toMatch(/mic check/i);
  });

  it('give Ojuelegba a non-combat local figure and still no boss', () => {
    expect(CAMPAIGN.districts.ojuelegba.boss).toBeNull();
    expect(fig.title).toContain('Underbridge');
    expect(CHARACTER_IDS).toContain(fig.look.characterId);
    expect(fig.introduction.length).toBeGreaterThanOrEqual(5);
    expect(fig.introduction.every((l) => !l.fromBroker)).toBe(true);
  });

  it('never use a real name, nickname or likeness cue', () => {
    const banned = ['oluomo', 'akinsanya', 'musiliu', 'igimu', 'iganmu', 'toba', 'ijaya', 'ajiboye'];
    const body = text([oshodi, fadeyi, fig]);
    for (const w of banned) expect(body.includes(w), w).toBe(false);
    // no royal / chiefly regalia on the Oshodi character, no allegations or violence in the identity text
    for (const w of ['crown', 'oba ', 'chief', 'stolen', 'bribe', 'kill', 'murder', 'thug']) {
      expect(text([oshodi.visualDirection, oshodi.personality, fig, fadeyi.personality]).includes(w), w).toBe(
        false,
      );
    }
  });
});
