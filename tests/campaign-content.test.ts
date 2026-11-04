import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN,
  DISTRICT_ORDER,
  FACTIONS,
  NPC_ROLE_INFO,
  allRewards,
  allUnlockIds,
  bossFor,
  bossList,
  defeatLines,
  districtList,
  nextDistrict,
  unlockIdsOfKind,
} from '../src/campaign';
import type { DistrictId, FactionKind, StoryLine } from '../src/campaign';
import { CHARACTER_IDS, MISSION_IDS, MODIFIER_FOR, getArena } from '../src/sim';
import type { NpcRole, ObjectiveKind } from '../src/sim';

const KIND_FOR: Record<string, ObjectiveKind> = {
  oshodi: 'dispatchRelays',
  mushin: 'supplyRoutes',
  fadeyiSomolu: 'junctionAccess',
  ebuteMetta: 'dispatchWindows',
  lagosIsland: 'evidenceRun',
  lekki: 'contingencyGrid',
};

const NARRATION = ['MAMA PUT', 'RADIO', 'NARRATOR', 'THE CHAIRMAN', 'UNKNOWN NUMBER'];

/** Every string in a value, recursively (with its path for failure messages). */
function strings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

function assertFilled(value: unknown, path: string): void {
  if (typeof value === 'string') expect(value.trim().length, `${path} empty`).toBeGreaterThan(0);
  else if (Array.isArray(value)) {
    expect(value.length, `${path} empty array`).toBeGreaterThan(0);
    value.forEach((v, i) => assertFilled(v, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertFilled(v, `${path}.${k}`);
  } else expect(value, `${path} missing`).not.toBeUndefined();
}

function bossVoice(id: (typeof MISSION_IDS)[number]): string {
  return bossFor(id).introduction.find((l) => !NARRATION.includes(l.speaker))!.speaker;
}

describe('campaign content structure', () => {
  it('has the seven districts in campaign order; Ojuelegba is the hub without a boss', () => {
    expect(Object.keys(CAMPAIGN.districts).sort()).toEqual([...DISTRICT_ORDER].sort());
    expect(districtList().map((d) => d.id)).toEqual([...DISTRICT_ORDER]);
    expect(DISTRICT_ORDER.slice(1)).toEqual([...MISSION_IDS]);
    expect(CAMPAIGN.districts.ojuelegba.boss).toBeNull();
    expect(bossList()).toHaveLength(6);
    for (const id of MISSION_IDS) {
      expect(CAMPAIGN.districts[id].boss, id).not.toBeNull();
      expect(bossFor(id).districtId).toBe(id);
    }
  });

  it('every district fills briefing, three landmarks, map position, arena and requirements', () => {
    const seen = new Set<string>();
    for (const d of districtList()) {
      assertFilled(d.name, `${d.id}.name`);
      assertFilled(d.tagline, `${d.id}.tagline`);
      assertFilled(d.briefing.title, `${d.id}.briefing.title`);
      assertFilled(d.briefing.location, `${d.id}.briefing.location`);
      assertFilled(d.briefing.summary, `${d.id}.briefing.summary`);
      assertFilled(d.briefing.objectives, `${d.id}.briefing.objectives`);
      assertFilled(d.briefing.intel, `${d.id}.briefing.intel`);
      assertFilled(d.briefing.warnings, `${d.id}.briefing.warnings`);
      expect(d.briefing.brokerMessage?.fromBroker, `${d.id} broker message`).toBe(true);
      expect(d.landmarks).toHaveLength(3);
      assertFilled(d.landmarks, `${d.id}.landmarks`);
      expect(new Set(d.landmarks.map((l) => l.id)).size).toBe(3);
      expect(d.mapPos.x).toBeGreaterThanOrEqual(0);
      expect(d.mapPos.x).toBeLessThanOrEqual(100);
      expect(d.mapPos.y).toBeGreaterThanOrEqual(0);
      expect(d.mapPos.y).toBeLessThanOrEqual(100);
      const key = `${d.mapPos.x},${d.mapPos.y}`;
      expect(seen.has(key), `${d.id} map position reused`).toBe(false);
      seen.add(key);
      expect(() => getArena(d.arenaId), `${d.id} arena`).not.toThrow();
      const i = DISTRICT_ORDER.indexOf(d.id);
      expect(d.requires).toEqual(i === 0 ? [] : [DISTRICT_ORDER[i - 1]]);
    }
  });

  it('the map is stylised Lagos: mainland north-west, island south-east', () => {
    const p = (id: DistrictId) => CAMPAIGN.districts[id].mapPos;
    expect(p('oshodi').x).toBeLessThan(p('lagosIsland').x);
    expect(p('oshodi').y).toBeLessThan(p('lagosIsland').y);
    expect(p('lekki').x).toBeGreaterThan(p('lagosIsland').x);
    expect(p('lekki').y).toBeGreaterThanOrEqual(p('lagosIsland').y);
  });

  it('every boss fills every contract field', () => {
    for (const boss of bossList()) {
      assertFilled(boss, boss.id);
      expect(boss.phases).toHaveLength(3);
      for (const ph of boss.phases) assertFilled(ph, `${boss.id}.phase`);
      expect(boss.introduction.length).toBeGreaterThanOrEqual(5);
      expect(boss.defeatSequence.length).toBeGreaterThanOrEqual(5);
      expect(boss.defeatSequenceOusted?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect((CHARACTER_IDS as readonly string[]).includes(boss.visualDirection.characterId)).toBe(true);
      expect(Number.isInteger(boss.visualDirection.palette.primary)).toBe(true);
      expect(Number.isInteger(boss.visualDirection.palette.accent)).toBe(true);
      expect(boss.consequenceFlags?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('ids line up with the sim: one distinct mechanic and one distinct replay modifier per boss', () => {
    for (const id of MISSION_IDS) {
      const boss = bossFor(id);
      expect(boss.objectiveKind).toBe(KIND_FOR[id]);
      expect(boss.replayModifier.id).toBe(MODIFIER_FOR[id]);
    }
    const bosses = bossList();
    expect(new Set(bosses.map((b) => b.objectiveKind)).size).toBe(6);
    expect(new Set(bosses.map((b) => b.replayModifier.id)).size).toBe(6);
    expect(new Set(bosses.map((b) => b.id)).size).toBe(6);
    expect(new Set(bosses.map((b) => b.name)).size).toBe(6);
  });

  it('six distinct personalities and voices; each defeat scene is specific to its boss', () => {
    const bosses = bossList();
    expect(new Set(bosses.map((b) => b.personality)).size).toBe(6);
    expect(new Set(bosses.map((b) => b.title)).size).toBe(6);
    const voices = MISSION_IDS.map((id) => bossVoice(id));
    expect(new Set(voices).size).toBe(6);
    for (const id of MISSION_IDS) {
      const b = bossFor(id);
      expect(b.introduction.filter((l) => l.speaker === bossVoice(id)).length).toBeGreaterThanOrEqual(2);
      expect(
        b.defeatSequence.some((l) => l.speaker === bossVoice(id)),
        `${id} reacts to its own defeat`,
      ).toBe(true);
    }
    expect(new Set(bosses.map((b) => b.introduction[1]!.text)).size).toBe(6);
    expect(new Set(bosses.map((b) => b.defeatSequence.map((l) => l.text).join('|'))).size).toBe(6);
  });

  it('the Oshodi vertical slice has the richest content', () => {
    const o = bossFor('oshodi');
    for (const b of bossList().filter((x) => x.id !== o.id)) {
      expect(o.defeatSequence.length).toBeGreaterThan(b.defeatSequence.length);
      expect(o.introduction.length).toBeGreaterThan(b.introduction.length);
    }
    const len = (id: DistrictId) => strings(CAMPAIGN.districts[id].briefing).join(' ').length;
    for (const id of MISSION_IDS.slice(1)) expect(len('oshodi'), id).toBeGreaterThan(len(id));
  });

  it('the ending, prologue and finale are present and the finale has the broker escape', () => {
    assertFilled(CAMPAIGN.ending, 'ending');
    expect(CAMPAIGN.prologue.length).toBeGreaterThanOrEqual(5);
    expect(CAMPAIGN.finale.length).toBeGreaterThanOrEqual(6);
    const finale = CAMPAIGN.finale
      .map((l) => l.text)
      .join(' ')
      .toLowerCase();
    expect(finale).toMatch(/boat|jetty|gone|vanish/);
    expect(CAMPAIGN.ending.summary.toLowerCase()).toContain('vanish');
    expect(CAMPAIGN.ending.teaser.length).toBeGreaterThan(20);
  });
});

describe('factions and roles', () => {
  it('has at least 8 factions covering every kind, with fictional palettes and roles', () => {
    const kinds: FactionKind[] = [
      'transportEnforcers',
      'routeMarshals',
      'marketCrew',
      'logisticsCrew',
      'securityContractors',
      'railDispatch',
      'communityDefenders',
      'officials',
    ];
    const list = Object.values(FACTIONS);
    expect(list.length).toBeGreaterThanOrEqual(8);
    for (const k of kinds)
      expect(
        list.some((f) => f.kind === k),
        k,
      ).toBe(true);
    for (const f of list) {
      assertFilled(f, f.id);
      expect(CAMPAIGN.factions[f.id]).toBe(f);
      for (const r of f.roles) expect(r.count).toBeGreaterThan(0);
    }
    expect(new Set(list.map((f) => f.name)).size).toBe(list.length);
    const allied = list.filter((f) => f.allied);
    expect(allied.length).toBeGreaterThanOrEqual(1);
    for (const f of allied) expect(f.kind).toBe('communityDefenders');
  });

  it('every referenced faction exists; each boss crew is a hostile faction of its district', () => {
    for (const d of districtList()) {
      for (const id of d.factionIds) expect(CAMPAIGN.factions[id], `${d.id} -> ${id}`).toBeDefined();
      if (d.boss) {
        const crew = CAMPAIGN.factions[d.boss.protectionCrew.factionId];
        expect(crew).toBeDefined();
        expect(d.factionIds).toContain(crew!.id);
        expect(crew!.allied).toBeFalsy();
      }
    }
    for (const f of Object.values(CAMPAIGN.factions)) {
      expect(
        districtList().some((d) => d.factionIds.includes(f.id)),
        `${f.id} is used`,
      ).toBe(true);
    }
  });

  it('describes all eight NPC roles', () => {
    const roles: NpcRole[] = [
      'meleeGuard',
      'rangedAttacker',
      'blocker',
      'runner',
      'escort',
      'objectiveDefender',
      'supportUnit',
      'bossAssistant',
    ];
    expect(Object.keys(NPC_ROLE_INFO).sort()).toEqual([...roles].sort());
    for (const r of roles) assertFilled(NPC_ROLE_INFO[r], r);
    for (const f of Object.values(FACTIONS)) for (const r of f.roles) expect(roles).toContain(r.role);
    for (const b of bossList()) for (const r of b.protectionCrew.roles) expect(roles).toContain(r.role);
  });
});

describe('rewards, unlocks and replay modifiers', () => {
  it('every boss pays one distinct reward that unlocks its modifier and the next district', () => {
    const rewards = allRewards();
    expect(new Set(rewards.map((r) => r.id)).size).toBe(6);
    for (const id of MISSION_IDS) {
      const b = bossFor(id);
      expect(b.reward.unlocks, b.reward.id).toContain(`modifier.${MODIFIER_FOR[id]}`);
      const next = nextDistrict(id);
      if (next) expect(b.reward.unlocks).toContain(`district.${next}`);
      else expect(b.reward.unlocks).toContain('finale.unlocked');
    }
    expect(new Set(rewards.map((r) => r.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it('referenced unlock ids exist and every modifier / district / costume unlock resolves', () => {
    const all = allUnlockIds();
    expect(new Set(all).size).toBe(all.length);
    for (const m of unlockIdsOfKind('modifier')) {
      expect(Object.values(MODIFIER_FOR)).toContain(m.slice('modifier.'.length));
    }
    for (const d of unlockIdsOfKind('district'))
      expect(DISTRICT_ORDER).toContain(d.slice('district.'.length));
    for (const c of unlockIdsOfKind('costume')) expect(CHARACTER_IDS).toContain(c.split('.')[1]);
    expect(unlockIdsOfKind('costume').length).toBeGreaterThanOrEqual(3);
    expect(unlockIdsOfKind('title').length).toBeGreaterThanOrEqual(2);
    expect(unlockIdsOfKind('perk').length).toBeGreaterThanOrEqual(2);
  });

  it('perks are informational only: no reward promises a mission or balance advantage', () => {
    for (const r of allRewards().filter((x) => x.kind === 'perk')) {
      expect(r.description.toLowerCase()).toMatch(/no effect on missions/);
    }
  });

  it('defeatLines picks the ousted scene when asked', () => {
    const b = bossFor('lekki');
    expect(defeatLines(b, 'ousted')).toBe(b.defeatSequenceOusted);
    expect(defeatLines(b, 'eliminated')).toBe(b.defeatSequence);
    expect(defeatLines(b, null)).toBe(b.defeatSequence);
  });
});

describe('ethics: fiction only, the broker is never shown', () => {
  const all = strings(CAMPAIGN);

  it('never names a real person, union, agency, party or company', () => {
    const denylist = [
      'tinubu',
      'jagaban',
      'nurtw',
      'lastma',
      'lagos state government',
      'sanwo',
      'buhari',
      'fashola',
      'ambode',
      'oluomo',
      'efcc',
      'nnpc',
      'dangote',
      'apc',
      'pdp',
      'police',
      'nigerian army',
      'lawma',
      'amoro',
      'ikeja electric',
      'eko disco',
      'nepa',
    ];
    for (const [path, text] of all) {
      const lower = text.toLowerCase();
      for (const term of denylist) {
        const re = new RegExp(`(^|[^a-z])${term}([^a-z]|$)`);
        expect(re.test(lower), `${path} mentions "${term}"`).toBe(false);
      }
    }
  });

  it('contains no demeaning language about communities or workers', () => {
    const mocking = [
      'area boys',
      'thug',
      'savage',
      'primitive',
      'jungle',
      'uncivilised',
      'uncivilized',
      'illiterate',
      'barbarian',
      'gangster',
      'traders are thieves',
    ];
    for (const [path, text] of all) {
      for (const term of mocking)
        expect(text.toLowerCase(), `${path} contains "${term}"`).not.toContain(term);
    }
  });

  it('keeps the real workers as bystanders, never villains', () => {
    const rail = Object.values(FACTIONS).find((f) => f.kind === 'railDispatch')!;
    expect(rail.description.toLowerCase()).toMatch(/honest/);
    const brief = strings(CAMPAIGN.districts.ebuteMetta.briefing).join(' ').toLowerCase();
    expect(brief).toMatch(/bystander/);
    const mushin = strings(CAMPAIGN.districts.mushin.briefing).join(' ').toLowerCase();
    expect(mushin).toMatch(/honest/);
  });

  it('the broker is fictional, never shown and only appears as a voice, message or silhouette', () => {
    const broker = CAMPAIGN.broker!;
    expect(broker.neverShown).toBe(true);
    expect(broker.name.length).toBeGreaterThan(3);
    expect(broker.presence.join(' ').toLowerCase()).toMatch(/never a face/);
    const lines: StoryLine[] = [
      ...CAMPAIGN.prologue,
      ...CAMPAIGN.finale,
      ...districtList().flatMap((d) => [
        ...(d.briefing.brokerMessage ? [d.briefing.brokerMessage] : []),
        ...(d.boss
          ? [...d.boss.introduction, ...d.boss.defeatSequence, ...(d.boss.defeatSequenceOusted ?? [])]
          : []),
      ]),
    ];
    for (const l of lines) {
      if (l.speaker === 'THE CHAIRMAN' || l.speaker === 'UNKNOWN NUMBER')
        expect(l.fromBroker, l.text).toBe(true);
      if (l.fromBroker) expect(['THE CHAIRMAN', 'UNKNOWN NUMBER']).toContain(l.speaker);
    }
    for (const b of bossList()) {
      expect(b.name).not.toContain(broker.name);
      expect(b.visualDirection.description.toLowerCase()).not.toContain('chairman');
    }
    const finale = CAMPAIGN.finale
      .map((l) => l.text)
      .join(' ')
      .toLowerCase();
    expect(finale).not.toMatch(/chairman (is|was) (caught|arrested|defeated)/);
    for (const d of districtList()) expect(d.briefing.brokerMessage, d.id).toBeDefined();
  });
});
