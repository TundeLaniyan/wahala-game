/**
 * The TEMPORARY founder QA entry (docs/QA_ENTRY.md, decision QA1): `?qaraid=` parses only real raids; the raid it starts
 * goes through the real CampaignController, plays at the asked level, and never writes the save (not on the result,
 * not on leaving, not for a player without a campaign). Leaving stops the match.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createSave, persistSave } from '../../src/campaign';
import type { KeyValueStore } from '../../src/campaign';
import { CampaignController } from '../../src/app/campaign';
import type { MissionHost } from '../../src/app/ports';
import { parseQaRaid } from '../../src/app/qaEntry';
import { useGameStore } from '../../src/app/store';
import { raidWin } from './sectionHelpers';

class CountingStore implements KeyValueStore {
  data = new Map<string, string>();
  writes = 0;
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => {
    this.writes++;
    this.data.set(k, v);
  };
  removeItem = (k: string): void => {
    this.writes++;
    this.data.delete(k);
  };
}

function rig(withSave: boolean) {
  const store = new CountingStore();
  if (withSave) persistSave(store, createSave(0));
  const before = new Map(store.data);
  store.writes = 0;
  const raidArgs: Record<string, unknown>[] = [];
  let stops = 0;
  let ended: ((o: ReturnType<typeof raidWin>) => void) | null = null;
  const host: MissionHost = {
    startMission: () => {},
    playRaid: (_o, meta) => void (ended = meta.onEnd as typeof ended),
    stop: () => void stops++,
  };
  const campaign = new CampaignController({
    store,
    host,
    now: () => 9_000,
    seed: () => 4,
    buildRaid: (args) => {
      raidArgs.push({ ...args });
      return {
        seed: args.seed,
        players: [{ name: 'You', characterId: args.humanCharacter, isBot: false }],
        settings: { game: 'raid' },
      };
    },
  });
  campaign.load();
  return {
    campaign,
    store,
    before,
    raidArgs,
    stops: () => stops,
    end: (o: ReturnType<typeof raidWin>) => ended!(o),
  };
}

describe('the founder QA raid entry', () => {
  beforeEach(() => useGameStore.setState({ campaign: null }));

  it('parses only a raid of this build, and an optional known level', () => {
    expect(parseQaRaid('?qaraid=recordsVault')).toEqual({ raidId: 'recordsVault', level: null });
    expect(parseQaRaid('?qaraid=recordsVault&qalevel=hard')).toEqual({
      raidId: 'recordsVault',
      level: 'hard',
    });
    expect(parseQaRaid('?qaraid=recordsVault&qalevel=insane')).toEqual({
      raidId: 'recordsVault',
      level: null,
    });
    expect(parseQaRaid('?qaraid=nowhere')).toBeNull();
    expect(parseQaRaid('?debug')).toBeNull();
    expect(parseQaRaid('')).toBeNull();
  });

  for (const withSave of [true, false])
    it(`plays the raid at the asked level and never writes the save (${withSave ? 'a saved campaign' : 'no campaign yet'})`, () => {
      const r = rig(withSave);
      expect(r.campaign.qaStartRaid('recordsVault', 'hard')).toBe(true);
      expect(r.raidArgs.at(-1)).toMatchObject({ raidId: 'recordsVault', level: 'hard' });
      expect(useGameStore.getState().campaign!.active?.raid?.raidId).toBe('recordsVault'); // Restart / Leave in the pause menu
      r.end(raidWin('recordsVault', { stars: 3 }));
      expect(useGameStore.getState().campaign!.sectionResult?.kind).toBe('raid'); // the result is shown...
      expect(r.store.writes).toBe(0); // ...and never saved
      expect(r.store.data).toEqual(r.before);
      expect(useGameStore.getState().campaign!.started).toBe(withSave);
    });

  it("without a level it plays at the save's level; leaving stops the match and writes nothing", () => {
    const r = rig(true);
    expect(r.campaign.qaStartRaid('recordsVault', null)).toBe(true);
    expect(r.raidArgs.at(-1)).toMatchObject({ level: createSave(0).campaignLevel });
    r.campaign.leaveRaid();
    expect(r.stops()).toBeGreaterThan(0);
    expect(r.store.writes).toBe(0);
  });
});
