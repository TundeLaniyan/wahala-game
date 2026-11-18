/**
 * The Ojuelegba finale chapter in the campaign layer (decisions FN1-FN10): unlocks, save shape and repair (no version
 * bump), Parts, the seat bonus, the story order (the interim beat after Lekki, the finale scene after mission 21) and
 * the provisional content rules.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN,
  CAMPAIGN_SAVE_KEY,
  FINALE,
  FINALE_CHAPTER,
  FINALE_SECTIONS,
  INTERIM,
  LANDLORD,
  PROLOGUE,
  applyMissionResult,
  applySectionResult,
  bossAvailable,
  bossFor,
  campaignProgress,
  cardIssues,
  createSave,
  districtParts,
  districtStatus,
  finaleAvailable,
  finaleCards,
  finaleChapterOpen,
  finaleStatus,
  loadSave,
  loadoutBonusFor,
  markInterimSeen,
  missionStatus,
  nextMission,
  partsEarned,
  repairSave,
  sectionStatus,
  storyCard,
} from '../src/campaign';
import type { CampaignSave, KeyValueStore, StoryLine } from '../src/campaign';
import { MISSION_IDS, buildMissionGame, createGame } from '../src/sim';
import type { MissionId, MissionOutcome } from '../src/sim';
import { sandbox } from './helpers';

class MapStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

const bossWin = (missionId: MissionId, stars: 1 | 2 | 3 = 2): MissionOutcome => ({
  result: 'won',
  missionId,
  modifiers: [],
  seconds: 200,
  livesUsed: 0,
  phasesCleared: 3,
  defeat: 'eliminated',
  stars,
  creditedKills: 3,
});
const fieldWin = (ref: string, stars: 1 | 2 | 3 = 2): MissionOutcome => ({
  ...bossWin(ref.split('.')[0] as MissionId, stars),
  defeat: null,
  sectionMissionId: ref,
  raidBonus: 0,
});

/** The six districts won through their boss results (a cleared district counts its sections cleared). */
function sixCleared(start: CampaignSave = createSave(1)): CampaignSave {
  return MISSION_IDS.reduce((s, id) => applyMissionResult(s, bossWin(id), 2).save, start);
}

function finaleWon(stars: 1 | 2 | 3 = 3): CampaignSave {
  let s = sixCleared();
  s = applySectionResult(s, fieldWin('ojuelegba.return', stars), 3).save;
  s = applySectionResult(s, fieldWin('ojuelegba.junction', stars), 4).save;
  return applyMissionResult(s, bossWin('ojuelegba', stars), 5).save;
}

/** A save written by the build before the finale existed: all six cleared, the old finale watched (version 2). */
function preFinaleSaveJson(): Record<string, unknown> {
  const s = sixCleared();
  const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  // the old shape: no finale sections or missions, the hub fresh, the old Lekki finale watched
  const sections = raw.sections as Record<string, unknown>;
  const missions = raw.missions as Record<string, unknown>;
  for (const k of Object.keys(sections)) if (k.startsWith('ojuelegba.')) delete sections[k];
  for (const k of Object.keys(missions)) if (k.startsWith('ojuelegba.')) delete missions[k];
  return { ...raw, completed: true, flags: [...(raw.flags as string[]), 'campaign.completed'] };
}

describe('unlocks: the finale opens only after the Lekki boss (FN1, FN2)', () => {
  it('a fresh save: the chapter is locked, the hub is still the cleared prologue hub', () => {
    const s = createSave(1);
    expect(districtStatus(s, 'ojuelegba')).toBe('cleared');
    expect(finaleStatus(s)).toBe('locked');
    expect(finaleChapterOpen(s)).toBe(false);
    for (const id of ['ojuelegba.return', 'ojuelegba.junction', 'ojuelegba.boss'])
      expect(missionStatus(s, id), id).toBe('locked');
    expect(sectionStatus(s, 'ojuelegba.s1')).toBe('locked');
    expect(bossAvailable(s, 'ojuelegba')).toBe(false);
    // a finale result on a locked chapter is ignored
    expect(applySectionResult(s, fieldWin('ojuelegba.return'), 2).save).toBe(s);
    expect(applyMissionResult(s, bossWin('ojuelegba'), 2).save).toBe(s);
  });

  it('five districts are not enough; Lekki’s boss opens it, and nextMission points to mission 19', () => {
    let s = createSave(1);
    for (const id of MISSION_IDS.slice(0, 5)) s = applyMissionResult(s, bossWin(id), 2).save;
    expect(finaleStatus(s)).toBe('locked');
    const lekki = applyMissionResult(s, bossWin('lekki'), 3);
    expect(lekki.finaleOpened).toBe(true);
    expect(lekki.campaignComplete).toBe(false);
    s = lekki.save;
    expect(finaleStatus(s)).toBe('available');
    expect(nextMission(s)).toEqual({
      districtId: 'ojuelegba',
      sectionId: 'ojuelegba.s1',
      missionId: 'ojuelegba.return',
    });
  });

  it('the order is 19, then 20, then the boss; the boss win completes the chapter once', () => {
    let s = sixCleared();
    expect(
      applySectionResult(s, fieldWin('ojuelegba.junction'), 2).save.missions['ojuelegba.junction']!.status,
    ).toBe('locked');
    expect(applyMissionResult(s, bossWin('ojuelegba'), 2).save).toBe(s); // the boss waits for 19 and 20
    const r19 = applySectionResult(s, fieldWin('ojuelegba.return'), 3);
    expect(r19.unlockedMissions).toEqual(['ojuelegba.junction']);
    s = r19.save;
    const r20 = applySectionResult(s, fieldWin('ojuelegba.junction'), 4);
    expect(r20.bossUnlocked).toBe(true);
    s = r20.save;
    expect(nextMission(s)?.missionId).toBe('ojuelegba.boss');
    const lost = applyMissionResult(s, { ...bossWin('ojuelegba'), result: 'lost', stars: 0 }, 5);
    expect(lost.save.districts.ojuelegba).toMatchObject({ status: 'cleared', attempts: 1, clears: 0 });
    expect(finaleStatus(lost.save)).toBe('available');
    const won = applyMissionResult(lost.save, bossWin('ojuelegba', 3), 6);
    expect(won).toMatchObject({ firstClear: true, campaignComplete: true });
    expect(won.newRewards).toEqual([LANDLORD.reward]);
    expect(won.save.flags).toEqual(expect.arrayContaining(['ojuelegba.cleared', 'ojuelegba.routesReopened']));
    expect(won.save.districts.ojuelegba).toMatchObject({ clears: 1, bestStars: 3, attempts: 2 });
    expect(finaleStatus(won.save)).toBe('cleared');
    expect(finaleAvailable(won.save)).toBe(true);
    expect(nextMission(won.save)).toBeNull();
    expect(campaignProgress(won.save).cleared).toBe(6); // the six districts; the finale has its own status
    // a replay pays nothing again and never reopens anything
    const again = applyMissionResult(won.save, bossWin('ojuelegba', 2), 7);
    expect(again).toMatchObject({ firstClear: false, campaignComplete: false, unlockedDistricts: [] });
    expect(again.save.districts.ojuelegba.bestStars).toBe(3);
  });
});

describe('save: optional fields, repaired on load, no version bump (FN4)', () => {
  it('an old save that cleared all six loads with the finale available: not lost, not auto-cleared', () => {
    const store = new MapStore();
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(preFinaleSaveJson()));
    const s = loadSave(store)!;
    expect(s.version).toBe(2);
    expect(MISSION_IDS.every((d) => s.districts[d].status === 'cleared')).toBe(true);
    expect(finaleStatus(s)).toBe('available');
    expect(s.districts.ojuelegba).toMatchObject({ status: 'cleared', clears: 0, bestStars: 0 });
    expect(s.completed).toBe(false); // the campaign now ends after the finale chapter
    expect(s.flags).not.toContain('campaign.completed');
    expect(s.interimSeen).toBeUndefined(); // Continue plays the interim beat once
    expect(missionStatus(s, 'ojuelegba.return')).toBe('available');
    expect(missionStatus(s, 'ojuelegba.junction')).toBe('locked');
    expect(s.missions['ojuelegba.return']).toMatchObject({ status: 'available', clears: 0 });
    expect(nextMission(s)?.missionId).toBe('ojuelegba.return');
    // nothing the player had is lost: the six districts' rewards, flags and section rewards are all there
    const before = sixCleared();
    expect(s.rewards).toEqual(before.rewards);
    expect(s.sectionRewards).toEqual(before.sectionRewards);
    expect(partsEarned(s)).toBe(partsEarned(before));
  });

  it('a version-1 save with all six cleared migrates to the same open chapter', () => {
    const v1 = {
      version: 1,
      startedAt: 1,
      updatedAt: 2,
      prologueSeen: true,
      completed: true,
      districts: Object.fromEntries(
        MISSION_IDS.map((d) => [d, { status: 'cleared', clears: 1, attempts: 1, bestStars: 2 }]),
      ),
    };
    const s = repairSave(v1)!;
    expect([s.version, finaleStatus(s), s.completed]).toEqual([2, 'available', false]);
  });

  it('a fresh save round-trips with the finale locked and no new top-level key', () => {
    const store = new MapStore();
    const s = createSave(3);
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(s));
    expect(loadSave(store)).toEqual(s);
    expect('interimSeen' in s).toBe(false);
    expect(finaleStatus(loadSave(store)!)).toBe('locked');
  });

  it('a won finale round-trips: stars, time, clears, the reward and the completed flag', () => {
    const won = { ...markInterimSeen(finaleWon(2), 9), completed: true };
    const store = new MapStore();
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(won));
    const s = loadSave(store)!;
    expect(s.districts.ojuelegba).toMatchObject({ clears: 1, bestStars: 2, bestSeconds: 200 });
    expect(s.rewards).toContain(LANDLORD.reward.id);
    expect([s.completed, s.interimSeen, finaleStatus(s)]).toEqual([true, true, 'cleared']);
  });

  it('corrupted finale fields are repaired, never trusted', () => {
    // a finale "win" claimed on a save whose chapter is not open
    const early = JSON.parse(JSON.stringify(createSave(1))) as CampaignSave;
    early.districts.ojuelegba = { ...early.districts.ojuelegba, clears: 9, bestStars: 3, bestSeconds: 5 };
    early.missions['ojuelegba.return'] = {
      status: 'cleared',
      attempts: 1,
      clears: 1,
      bestStars: 3,
      bestSeconds: 9,
    };
    const e = repairSave({ ...early, interimSeen: true, completed: true })!;
    expect(e.districts.ojuelegba).toMatchObject({
      status: 'cleared',
      clears: 0,
      bestStars: 0,
      bestSeconds: null,
    });
    expect(e.missions['ojuelegba.return']!.status).toBe('locked');
    expect(e.interimSeen).toBeUndefined();
    expect(e.completed).toBe(false);
    expect(e.rewards).not.toContain(LANDLORD.reward.id);

    // mission 20 claimed without 19; junk stars, modifiers and status on the hub record
    const open = JSON.parse(JSON.stringify(sixCleared())) as Record<string, unknown> & CampaignSave;
    open.missions['ojuelegba.junction'] = {
      status: 'cleared',
      attempts: 2,
      clears: 2,
      bestStars: 3,
      bestSeconds: 1,
    };
    (open.districts as unknown as Record<string, unknown>).ojuelegba = {
      status: 'locked',
      clears: 'x',
      attempts: -4,
      bestStars: 99,
      modifiersCleared: ['curfew', 'marketDay', 'nonsense'],
      introSeen: true,
    };
    const o = repairSave(open)!;
    expect(o.missions['ojuelegba.junction']!.status).toBe('locked');
    expect(o.missions['ojuelegba.return']!.status).toBe('available');
    expect(o.districts.ojuelegba).toMatchObject({ status: 'cleared', clears: 0, bestStars: 0, attempts: 0 });
    expect(o.districts.ojuelegba.introSeen).toBe(true);

    // a real clear with junk modifiers keeps only the finale's own
    const won = JSON.parse(JSON.stringify(finaleWon())) as CampaignSave;
    won.districts.ojuelegba.modifiersCleared = ['curfew', 'marketDay'] as never;
    won.districts.ojuelegba.bestStars = 7 as never;
    const w = repairSave(won)!;
    expect(w.districts.ojuelegba.modifiersCleared).toEqual(['curfew']);
    expect(w.districts.ojuelegba.bestStars).toBe(3);
    expect(finaleStatus(w)).toBe('cleared');
  });
});

describe('Generator Parts and the seat bonus (FN4, PR9-PR15)', () => {
  it('missions 19-21 earn Parts like every other mission (3 / +1 / +1 by best stars)', () => {
    const six = sixCleared();
    expect(districtParts(six, 'ojuelegba')).toEqual({ earned: 0, max: 15 });
    const one = applySectionResult(six, fieldWin('ojuelegba.return', 1), 2).save;
    expect(partsEarned(one) - partsEarned(six)).toBe(3);
    const all = finaleWon(3);
    expect(districtParts(all, 'ojuelegba')).toEqual({ earned: 15, max: 15 });
  });

  it('the upgrades ride into the finale’s field and boss missions, and nowhere outside the campaign', () => {
    const s = { ...finaleWon(3), upgrades: { capacity: 1, range: 1 } };
    const bonus = loadoutBonusFor(s, 'ojuelegba');
    expect(bonus).toEqual({ capacity: 1, range: 1 });
    for (const spec of [
      { id: 'ojuelegba' as const, fieldId: 'ojuelegba.return' },
      { id: 'ojuelegba' as const },
    ]) {
      const g = createGame(
        buildMissionGame({ spec, humanCharacter: 'streetBaller', seed: 1, loadoutBonus: bonus! }),
      );
      expect(g.players[0]!.loadoutBonus, JSON.stringify(spec)).toEqual(bonus);
    }
    // City Rumble and Classic drop a bonus handed to them (PR3)
    const rumble = sandbox({ players: 4, arenaId: 'rumbleOjuelegba' });
    expect(rumble.players[0]!.loadoutBonus).toBeUndefined();
    const classic = createGame({
      seed: 1,
      players: [
        { name: 'A', characterId: 'streetBaller', isBot: false, loadoutBonus: bonus! },
        { name: 'B', characterId: 'lekkiBoy', isBot: true },
      ],
    });
    expect(classic.players[0]!.loadoutBonus).toBeUndefined();
  });
});

describe('story order: the interim beat after Lekki, the finale scene after mission 21 (FN9)', () => {
  const texts = (lines: StoryLine[]): string => lines.map((l) => l.text).join(' ');

  it('the interim beat is the old Lekki opening and ends with Ojuelegba still locked', () => {
    expect(INTERIM[0]!.text).toMatch(/^Lekki, after midnight\. The estates go dark/);
    expect(texts(INTERIM)).toContain('The estates go dark, but Ojuelegba is still locked.');
    expect(texts(INTERIM)).not.toMatch(/boat|jetty/i); // the escape moved after the finale
    expect(CAMPAIGN.finaleChapter).toBe(FINALE_CHAPTER);
    expect(storyCard('interim').title).toBe('Still Locked');
  });

  it('the finale scene: the routes reopen first, then the Chairman, his escape by the jetty, then the teaser', () => {
    const at = (re: RegExp): number => FINALE.findIndex((l) => re.test(l.text));
    const routes = at(/every route into the junction is open/);
    const danfo = at(/impounded danfo has been released/);
    const stall = at(/My stall get light, the junction get light/);
    const chairman = FINALE.findIndex((l) => l.fromBroker);
    const boat = at(/pale boat slides out from the jetty/);
    expect(Math.min(routes, danfo, stall)).toBeGreaterThanOrEqual(0);
    expect(Math.max(routes, danfo, stall)).toBeLessThan(chairman);
    expect(chairman).toBeLessThan(boat);
    expect(texts(FINALE)).toMatch(/The man is not caught/);
    expect(CAMPAIGN.ending.teaser).toMatch(/Season two/);
    expect(CAMPAIGN.ending.summary).toMatch(/Ojuelegba takes its own corner back/);
  });

  it('the Chairman is unseen, never fought and escapes: never a boss, only message lines', () => {
    const chairman = CAMPAIGN.broker!.name;
    expect(LANDLORD.name).not.toContain(chairman);
    expect(bossFor('ojuelegba')).toBe(LANDLORD);
    for (const l of [...INTERIM, ...FINALE, ...LANDLORD.introduction, ...LANDLORD.defeatSequence]) {
      if (l.speaker === 'THE CHAIRMAN' || l.speaker === 'UNKNOWN NUMBER')
        expect(l.fromBroker, l.text).toBe(true);
      if (l.fromBroker) expect(['THE CHAIRMAN', 'UNKNOWN NUMBER']).toContain(l.speaker);
    }
    expect(texts(FINALE).toLowerCase()).not.toMatch(/chairman (is|was) (caught|arrested|defeated)/);
  });
});

describe('provisional content and the canon rules (FN8)', () => {
  const newLines = (): StoryLine[] => [
    ...INTERIM.slice(2),
    ...FINALE.filter((l) => l.provisional),
    ...LANDLORD.introduction,
    ...LANDLORD.defeatSequence,
    ...FINALE_SECTIONS.flatMap((s) => s.missions.flatMap((m) => [...(m.intro ?? []), ...(m.outro ?? [])])),
  ];

  it('the enforcer is the working title, plainly named and flagged provisional; every new line is flagged', () => {
    expect(LANDLORD.name).toBe('The Landlord');
    expect(LANDLORD.provisional).toBe(true);
    expect(LANDLORD.title).toMatch(/working title/);
    expect(LANDLORD.culturalInspiration).toMatch(/Working title, provisional/);
    expect(LANDLORD.visualDirection.description).toMatch(
      /^TEMPORARY: reuses the campaign’s existing Boss variant/,
    );
    for (const l of newLines()) expect(l.provisional, l.text).toBe(true);
    for (const m of FINALE_SECTIONS.flatMap((s) => s.missions)) expect(m.provisional, m.id).toBe(true);
    // the shipped lines kept from before are not flagged
    expect(INTERIM[0]!.provisional).toBeUndefined();
    expect(PROLOGUE.every((l) => !l.provisional)).toBe(true);
  });

  it('Bayo: at most two short lines inside his LOCKED arc; no broken promise, no Tayo', () => {
    const all = JSON.stringify(CAMPAIGN).toLowerCase();
    const bayo = [...newLines()].filter((l) => /bayo/i.test(`${l.speaker} ${l.text}`));
    expect(bayo.length).toBeLessThanOrEqual(2);
    for (const l of bayo) expect(l.text.split(' ').length).toBeLessThanOrEqual(25);
    expect(all).not.toContain('tayo');
    expect(all).not.toMatch(/broken promise|promised to keep/);
  });

  it('the finale cards stay within the card limits', () => {
    const cards = finaleCards();
    expect(cards.map((c) => c.id)).toEqual([
      'interim',
      'briefing.finale',
      'intro.ojuelegba',
      'defeat.ojuelegba',
    ]);
    for (const c of cards) expect(cardIssues(c), c.id).toEqual([]);
  });

  it('the denylists hold over the whole finale content (names, agencies, mocking words)', () => {
    const text = JSON.stringify([FINALE_CHAPTER, FINALE_SECTIONS, FINALE, CAMPAIGN.ending]).toLowerCase();
    for (const term of [
      'tinubu',
      'jagaban',
      'nurtw',
      'lastma',
      'police',
      'nepa',
      'apc',
      'pdp',
      'oluomo',
      'area boys',
      'thug',
      'gangster',
    ])
      expect(new RegExp(`(^|[^a-z])${term}([^a-z]|$)`).test(text), term).toBe(false);
  });
});
