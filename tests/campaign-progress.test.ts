import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN,
  CAMPAIGN_SAVE_KEY,
  DISTRICT_ORDER,
  applyMissionResult,
  availableModifiers,
  bossFor,
  browserStore,
  campaignProgress,
  clearSave,
  completeCampaign,
  createSave,
  districtStatus,
  finaleAvailable,
  isUnlockedFighterContent,
  loadSave,
  markIntroSeen,
  markPrologueSeen,
  persistSave,
  repairSave,
  setLoadout,
} from '../src/campaign';
import type { CampaignSave, KeyValueStore } from '../src/campaign';
import { MISSION_IDS, MODIFIER_FOR } from '../src/sim';
import type { MissionId, MissionModifierId, MissionOutcome } from '../src/sim';

class MapStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

const throwing: KeyValueStore = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new DOMException('quota', 'QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

function outcome(
  missionId: MissionId,
  result: MissionOutcome['result'] = 'won',
  extra: Partial<MissionOutcome> = {},
): MissionOutcome {
  const won = result === 'won';
  return {
    result,
    missionId,
    modifiers: [],
    seconds: 100,
    livesUsed: 0,
    phasesCleared: won ? 3 : 1,
    defeat: won ? 'eliminated' : null,
    stars: won ? 2 : 0,
    creditedKills: 3,
    ...extra,
  };
}

function winAll(start: CampaignSave, upTo: number = MISSION_IDS.length): CampaignSave {
  let save = start;
  MISSION_IDS.slice(0, upTo).forEach((id, i) => {
    save = applyMissionResult(save, outcome(id), 1000 + i).save;
  });
  return save;
}

describe('createSave', () => {
  it('Ojuelegba is cleared (the hub), Oshodi is available and the rest are locked', () => {
    const s = createSave(5);
    expect(s.version).toBe(1);
    expect(s.startedAt).toBe(5);
    expect(s.updatedAt).toBe(5);
    expect(districtStatus(s, 'ojuelegba')).toBe('cleared');
    expect(districtStatus(s, 'oshodi')).toBe('available');
    for (const id of MISSION_IDS.slice(1)) expect(districtStatus(s, id)).toBe('locked');
    expect(s.rewards).toEqual([]);
    expect(s.completed).toBe(false);
    expect(campaignProgress(s)).toEqual({ cleared: 0, total: 6, percent: 0 });
    expect(finaleAvailable(s)).toBe(false);
  });
});

describe('applyMissionResult', () => {
  it('winning in order unlocks the next district and pays each reward once', () => {
    let save = createSave(0);
    MISSION_IDS.forEach((id, i) => {
      expect(districtStatus(save, id)).toBe('available');
      const r = applyMissionResult(save, outcome(id), 10 + i);
      expect(r.firstClear).toBe(true);
      expect(r.newRewards).toEqual([bossFor(id).reward]);
      expect(r.newUnlocks).toEqual(expect.arrayContaining(bossFor(id).reward.unlocks!));
      const next = DISTRICT_ORDER[DISTRICT_ORDER.indexOf(id) + 1];
      expect(r.unlockedDistricts).toEqual(next ? [next] : []);
      if (next) expect(districtStatus(r.save, next)).toBe('available');
      expect(r.campaignComplete).toBe(i === MISSION_IDS.length - 1);
      save = r.save;
    });
    expect(campaignProgress(save)).toEqual({ cleared: 6, total: 6, percent: 100 });
    expect(save.rewards).toHaveLength(6);
    expect(save.flags).toContain('oshodi.dispatchBroken');
    expect(save.flags).toContain('lekki.gridDark');
  });

  it('a full six-win run ends complete after completeCampaign', () => {
    const won = winAll(createSave(0));
    expect(finaleAvailable(won)).toBe(true);
    expect(won.completed).toBe(false);
    const done = completeCampaign(won, 5000);
    expect(done.completed).toBe(true);
    expect(done.flags).toContain('campaign.completed');
    expect(done.updatedAt).toBe(5000);
    expect(completeCampaign(done, 6000)).toBe(done);
  });

  it('completeCampaign does nothing before all six are cleared', () => {
    const partial = winAll(createSave(0), 5);
    expect(finaleAvailable(partial)).toBe(false);
    expect(completeCampaign(partial, 9)).toBe(partial);
    expect(completeCampaign(createSave(0), 9).completed).toBe(false);
  });

  it('losses and timeouts count an attempt only: nothing unlocks, nothing is paid', () => {
    const start = createSave(0);
    for (const result of ['lost', 'timeout'] as const) {
      const r = applyMissionResult(start, outcome('oshodi', result), 50);
      expect(r.save.districts.oshodi.attempts).toBe(1);
      expect(r.save.districts.oshodi.clears).toBe(0);
      expect(r.save.districts.oshodi.status).toBe('available');
      expect(r.save.districts.oshodi.bestStars).toBe(0);
      expect(districtStatus(r.save, 'mushin')).toBe('locked');
      expect(r.save.rewards).toEqual([]);
      expect(r.save.unlocks).toEqual([]);
      expect(r).toMatchObject({ newRewards: [], newUnlocks: [], unlockedDistricts: [], firstClear: false });
      expect(r.campaignComplete).toBe(false);
    }
    const again = applyMissionResult(
      applyMissionResult(start, outcome('oshodi', 'lost'), 1).save,
      outcome('oshodi', 'lost'),
      2,
    );
    expect(again.save.districts.oshodi.attempts).toBe(2);
  });

  it('does not mutate its input', () => {
    const start = createSave(0);
    const snapshot = JSON.stringify(start);
    applyMissionResult(start, outcome('oshodi'), 1);
    applyMissionResult(start, outcome('oshodi', 'lost'), 1);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('never pays twice: replaying a cleared district grants nothing new', () => {
    const first = applyMissionResult(createSave(0), outcome('oshodi'), 1);
    const second = applyMissionResult(first.save, outcome('oshodi', 'won', { stars: 3 }), 2);
    expect(second.firstClear).toBe(false);
    expect(second.newRewards).toEqual([]);
    expect(second.newUnlocks).toEqual([]);
    expect(second.unlockedDistricts).toEqual([]);
    expect(second.campaignComplete).toBe(false);
    expect(second.save.rewards).toEqual(first.save.rewards);
    expect(second.save.unlocks).toEqual(first.save.unlocks);
    expect(second.save.districts.oshodi.clears).toBe(2);
    // a reward id that is already held is never paid again even on a "first" clear
    const held: CampaignSave = { ...createSave(0), rewards: [bossFor('oshodi').reward.id] };
    expect(applyMissionResult(held, outcome('oshodi'), 1).newRewards).toEqual([]);
  });

  it('keeps the best stars and the best time', () => {
    let s = applyMissionResult(createSave(0), outcome('oshodi', 'won', { stars: 2, seconds: 120 }), 1).save;
    s = applyMissionResult(s, outcome('oshodi', 'won', { stars: 1, seconds: 150 }), 2).save;
    expect(s.districts.oshodi.bestStars).toBe(2);
    expect(s.districts.oshodi.bestSeconds).toBe(120);
    s = applyMissionResult(s, outcome('oshodi', 'won', { stars: 3, seconds: 90 }), 3).save;
    expect(s.districts.oshodi.bestStars).toBe(3);
    expect(s.districts.oshodi.bestSeconds).toBe(90);
    s = applyMissionResult(s, outcome('oshodi', 'lost'), 4).save;
    expect(s.districts.oshodi.bestStars).toBe(3);
    expect(s.districts.oshodi.attempts).toBe(4);
  });

  it('records modifier clears only on a win with modifiers', () => {
    let s = applyMissionResult(createSave(0), outcome('oshodi'), 1).save;
    expect(s.districts.oshodi.modifiersCleared).toEqual([]);
    const m: MissionModifierId[] = ['rushHourDispatch'];
    s = applyMissionResult(s, outcome('oshodi', 'lost', { modifiers: m }), 2).save;
    expect(s.districts.oshodi.modifiersCleared).toEqual([]);
    s = applyMissionResult(s, outcome('oshodi', 'won', { modifiers: m }), 3).save;
    expect(s.districts.oshodi.modifiersCleared).toEqual(['rushHourDispatch']);
    s = applyMissionResult(s, outcome('oshodi', 'won', { modifiers: m }), 4).save;
    expect(s.districts.oshodi.modifiersCleared).toEqual(['rushHourDispatch']);
    // unknown modifier ids are ignored
    s = applyMissionResult(
      s,
      outcome('oshodi', 'won', { modifiers: ['bogus' as MissionModifierId] }),
      5,
    ).save;
    expect(s.districts.oshodi.modifiersCleared).toEqual(['rushHourDispatch']);
  });

  it('ignores a result for a district that is still locked', () => {
    const start = createSave(0);
    const r = applyMissionResult(start, outcome('lekki'), 1);
    expect(r.save).toBe(start);
    expect(r.firstClear).toBe(false);
    expect(r.newRewards).toEqual([]);
  });

  it('a first-clear unlocks the modifier, the next district and the costume', () => {
    const r = applyMissionResult(createSave(0), outcome('oshodi'), 1);
    expect(isUnlockedFighterContent(r.save, 'modifier.rushHourDispatch')).toBe(true);
    expect(isUnlockedFighterContent(r.save, 'district.mushin')).toBe(true);
    expect(isUnlockedFighterContent(r.save, 'costume.streetBaller.interchangeHiVis')).toBe(true);
    expect(isUnlockedFighterContent(r.save, 'costume.lekkiBoy.standbyBlack')).toBe(false);
    expect(isUnlockedFighterContent(createSave(0), 'modifier.rushHourDispatch')).toBe(false);
  });
});

describe('availableModifiers, loadout, markers', () => {
  it('a replay modifier unlocks after the first clear', () => {
    const start = createSave(0);
    expect(availableModifiers(start, 'oshodi')).toEqual([]);
    const lost = applyMissionResult(start, outcome('oshodi', 'lost'), 1).save;
    expect(availableModifiers(lost, 'oshodi')).toEqual([]);
    const won = applyMissionResult(start, outcome('oshodi'), 1).save;
    expect(availableModifiers(won, 'oshodi')).toEqual([MODIFIER_FOR.oshodi]);
    expect(availableModifiers(won, 'mushin')).toEqual([]);
    expect(availableModifiers(winAll(start), 'lekki')).toEqual(['longBlackout']);
  });

  it('setLoadout validates the fighter and the level', () => {
    const s = createSave(0);
    const a = setLoadout(s, { character: 'campusQueen', difficulty: 'expert' }, 9);
    expect(a.character).toBe('campusQueen');
    expect(a.difficulty).toBe('expert');
    expect(a.updatedAt).toBe(9);
    const b = setLoadout(a, { character: 'nobody' as never, difficulty: 'impossible' as never }, 10);
    expect(b).toBe(a);
    expect(setLoadout(a, { difficulty: 'casual' }, 11).character).toBe('campusQueen');
    expect(s.character).not.toBe('campusQueen');
  });

  it('marks the prologue and boss introductions as seen without touching other data', () => {
    const s = createSave(0);
    const p = markPrologueSeen(s, 3);
    expect(p.prologueSeen).toBe(true);
    expect(s.prologueSeen).toBe(false);
    expect(markPrologueSeen(p, 4)).toBe(p);
    const i = markIntroSeen(p, 'oshodi', 7);
    expect(i.districts.oshodi.introSeen).toBe(true);
    expect(i.districts.mushin.introSeen).toBe(false);
    expect(i.updatedAt).toBe(7);
  });
});

describe('save and load', () => {
  it('round-trips a mid-campaign save', () => {
    const store = new MapStore();
    let save = winAll(createSave(11), 3);
    save = setLoadout(
      markIntroSeen(markPrologueSeen(save, 12), 'ebuteMetta', 13),
      { character: 'lekkiBoy', difficulty: 'skilled' },
      14,
    );
    save = applyMissionResult(save, outcome('ebuteMetta', 'won', { modifiers: [] }), 15).save;
    expect(persistSave(store, save)).toBe(true);
    const loaded = loadSave(store);
    expect(loaded).toEqual(save);
    expect(loadSave(store)).toEqual(loaded);
  });

  it('round-trips a completed campaign with modifier clears', () => {
    const store = new MapStore();
    let save = winAll(createSave(0));
    save = applyMissionResult(
      save,
      outcome('lekki', 'won', { modifiers: ['longBlackout'], stars: 3, seconds: 80 }),
      99,
    ).save;
    save = completeCampaign(save, 100);
    persistSave(store, save);
    expect(loadSave(store)).toEqual(save);
  });

  it('returns null for an empty store and after clearSave', () => {
    const store = new MapStore();
    expect(loadSave(store)).toBeNull();
    persistSave(store, createSave(1));
    expect(loadSave(store)).not.toBeNull();
    clearSave(store);
    expect(store.data.has(CAMPAIGN_SAVE_KEY)).toBe(false);
    expect(loadSave(store)).toBeNull();
  });

  it('rejects unreadable data without throwing and keeps a copy aside', () => {
    for (const text of ['{', 'not json', '[]', '42', 'null', '"x"', '{"version":99}']) {
      const store = new MapStore();
      store.setItem(CAMPAIGN_SAVE_KEY, text);
      expect(() => loadSave(store), text).not.toThrow();
      expect(loadSave(store), text).toBeNull();
      expect(store.getItem(`${CAMPAIGN_SAVE_KEY}.corrupt`), text).toBe(text);
    }
  });

  it('repairs a partially corrupt save into a valid one', () => {
    const store = new MapStore();
    const junk = {
      version: 1,
      startedAt: 'yesterday',
      updatedAt: -4,
      prologueSeen: 'yes',
      character: 'hacker',
      difficulty: 'godlike',
      completed: true,
      rewards: ['reward.lekki.ringBreaker', 'free.money'],
      unlocks: ['district.lekki', '__proto__'],
      flags: [1, null],
      districts: {
        ojuelegba: 5,
        oshodi: {
          status: 'cleared',
          clears: 2.7,
          attempts: -1,
          bestStars: 9,
          bestSeconds: 'fast',
          modifiersCleared: ['marketDay', 'rushHourDispatch', 3],
        },
        mushin: { status: 'cleared', clears: 1, bestStars: 3 },
        fadeyiSomolu: { status: 'cleared', clears: 'many' },
        lekki: { status: 'cleared', clears: 5, bestStars: 3 },
        nowhere: { status: 'cleared' },
      },
    };
    store.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(junk));
    const s = loadSave(store)!;
    expect(s).not.toBeNull();
    expect(s.version).toBe(1);
    expect(s.startedAt).toBe(0);
    expect(s.updatedAt).toBeGreaterThanOrEqual(s.startedAt);
    expect(s.prologueSeen).toBe(false);
    expect(s.character).toBe(createSave(0).character);
    expect(s.difficulty).toBe('rookie');
    expect(s.districts.ojuelegba.status).toBe('cleared');
    expect(s.districts.oshodi.status).toBe('cleared');
    expect(s.districts.oshodi.clears).toBe(2);
    expect(s.districts.oshodi.attempts).toBeGreaterThanOrEqual(2);
    expect(s.districts.oshodi.bestStars).toBe(3);
    expect(s.districts.oshodi.bestSeconds).toBeNull();
    expect(s.districts.oshodi.modifiersCleared).toEqual(['rushHourDispatch']);
    expect(s.districts.mushin.status).toBe('cleared');
    // "many" is not a clear count but the district is cleared; Lekki cannot be (Lagos Island was never cleared)
    expect(s.districts.fadeyiSomolu.status).toBe('cleared');
    expect(s.districts.ebuteMetta.status).toBe('available');
    expect(s.districts.lekki.status).toBe('locked');
    expect(s.districts.lekki.clears).toBe(0);
    expect(s.completed).toBe(false);
    // rewards / unlocks / flags are rebuilt from what is really cleared
    expect(s.rewards).toEqual([
      'reward.oshodi.hiVis',
      'reward.mushin.routeMemory',
      'reward.fadeyiSomolu.freeCrossing',
    ]);
    expect(s.unlocks).not.toContain('district.lekki');
    expect(s.unlocks).toContain('district.ebuteMetta');
    expect(s.flags).toContain('mushin.supplyBroken');
    expect(s.flags).not.toContain('lekki.gridDark');
  });

  it('a save is internally consistent after repair: statuses follow the chain', () => {
    const s = repairSave({ version: 1, districts: { mushin: { status: 'cleared', clears: 1 } } })!;
    // Oshodi was never cleared, so Mushin cannot be.
    expect(s.districts.oshodi.status).toBe('available');
    expect(s.districts.mushin.status).toBe('locked');
    expect(s.districts.mushin.clears).toBe(0);
    expect(s.rewards).toEqual([]);
  });

  it('migrates the old list-of-cleared shape', () => {
    const s = repairSave({ cleared: ['oshodi', 'mushin'], character: 'campusQueen' })!;
    expect(s.version).toBe(1);
    expect(s.districts.oshodi.status).toBe('cleared');
    expect(s.districts.mushin.status).toBe('cleared');
    expect(s.districts.fadeyiSomolu.status).toBe('available');
    expect(s.character).toBe('campusQueen');
    expect(s.rewards).toHaveLength(2);
    const v0 = repairSave({ version: 0, cleared: ['oshodi'] })!;
    expect(v0.districts.oshodi.status).toBe('cleared');
  });

  it('completed only survives when all six are cleared', () => {
    const full = winAll(createSave(0));
    expect(repairSave({ ...full, completed: true })!.completed).toBe(true);
    const partial = winAll(createSave(0), 4);
    expect(repairSave({ ...partial, completed: true })!.completed).toBe(false);
  });

  it('survives hostile input shapes', () => {
    for (const v of [
      undefined,
      null,
      0,
      'x',
      [],
      { districts: 'no' },
      { districts: [] },
      { districts: { oshodi: null } },
      { version: -1 },
    ]) {
      expect(() => repairSave(v)).not.toThrow();
    }
    expect(repairSave({ districts: 'no' })!.districts.oshodi.status).toBe('available');
  });
});

describe('storage failures never throw', () => {
  it('persistSave returns false on a quota or private-mode error', () => {
    expect(persistSave(throwing, createSave(0))).toBe(false);
  });

  it('loadSave returns null and clearSave is silent when storage throws', () => {
    expect(loadSave(throwing)).toBeNull();
    expect(() => clearSave(throwing)).not.toThrow();
  });

  it('persistSave returns false when the value cannot be serialised', () => {
    const circular = createSave(0) as CampaignSave & { self?: unknown };
    circular.self = circular;
    expect(persistSave(new MapStore(), circular)).toBe(false);
  });

  it('browserStore is null outside a browser and never throws', () => {
    expect(() => browserStore()).not.toThrow();
    expect(browserStore()).toBeNull();
  });

  it('browserStore wraps localStorage when it works and is null when it throws', () => {
    const g = globalThis as unknown as { window?: unknown };
    const original = g.window;
    try {
      const data = new Map<string, string>();
      g.window = {
        localStorage: {
          getItem: (k: string) => data.get(k) ?? null,
          setItem: (k: string, v: string) => void data.set(k, v),
          removeItem: (k: string) => void data.delete(k),
        },
      };
      const store = browserStore()!;
      expect(store).not.toBeNull();
      expect(persistSave(store, createSave(2))).toBe(true);
      expect(loadSave(store)?.startedAt).toBe(2);
      g.window = {
        get localStorage(): never {
          throw new Error('blocked');
        },
      };
      expect(browserStore()).toBeNull();
      g.window = {
        localStorage: {
          getItem: () => null,
          setItem: () => {
            throw new Error('full');
          },
          removeItem: () => undefined,
        },
      };
      expect(browserStore()).toBeNull();
    } finally {
      if (original === undefined) delete g.window;
      else g.window = original;
    }
  });
});

describe('content and progress agree', () => {
  it('every cleared district in a fresh full run has all its flags, rewards and unlocks', () => {
    const save = winAll(createSave(0));
    for (const id of MISSION_IDS) {
      const boss = CAMPAIGN.districts[id].boss!;
      expect(save.rewards).toContain(boss.reward.id);
      for (const u of boss.reward.unlocks ?? []) expect(save.unlocks).toContain(u);
      for (const f of boss.consequenceFlags ?? []) expect(save.flags).toContain(f);
    }
    expect(save.unlocks).toContain('finale.unlocked');
    // repairing a legitimate save changes nothing
    expect(repairSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });
});
