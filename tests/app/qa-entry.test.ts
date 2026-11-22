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

function rig(withSave: boolean, testLabUnlocked = false) {
  const store = new CountingStore();
  if (withSave) persistSave(store, createSave(0));
  const before = new Map(store.data);
  store.writes = 0;
  const raidArgs: Record<string, unknown>[] = [];
  const raidMetas: Record<string, unknown>[] = [];
  const missionStarts: Record<string, unknown>[] = [];
  let stops = 0;
  let ended: ((o: ReturnType<typeof raidWin>) => void) | null = null;
  const host: MissionHost = {
    startMission: (_o, meta) => void missionStarts.push({ ...meta }),
    playRaid: (_o, meta) => {
      raidMetas.push({ ...meta });
      ended = meta.onEnd as typeof ended;
    },
    stop: () => void stops++,
  };
  const campaign = new CampaignController({
    store,
    host,
    now: () => 9_000,
    seed: () => 4,
    ...(testLabUnlocked ? { testLabUnlocked } : {}),
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
    raidMetas,
    missionStarts,
    stops: () => stops,
    end: (o: ReturnType<typeof raidWin>) => ended!(o),
  };
}

describe('the no-save raid path', () => {
  beforeEach(() => useGameStore.setState({ campaign: null }));

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

  it('the Test Lab passes a scenario set-up, a fixed seed and a clock through; a real raid passes none', () => {
    const r = rig(false);
    const prepare = () => {};
    expect(r.campaign.qaStartRaid('warehouseDispatchDepot', 'normal')).toBe(true);
    expect(r.raidMetas.at(-1)).not.toHaveProperty('prepare');
    expect(r.raidArgs.at(-1)).toMatchObject({ seed: 4 }); // the controller's own seed
    expect(r.raidArgs.at(-1)).not.toHaveProperty('timeLimitSec');
    expect(
      r.campaign.qaStartRaid('warehouseDispatchDepot', 'easy', { prepare, seed: 4101, timeLimitSec: 600 }),
    ).toBe(true);
    expect(r.raidMetas.at(-1)!.prepare).toBe(prepare);
    expect(r.raidArgs.at(-1)).toMatchObject({ seed: 4101, timeLimitSec: 600, level: 'easy' });
    // and a restart (Retry raid) replays the same set-up
    r.campaign.retryRaid();
    expect(r.raidMetas.at(-1)!.prepare).toBe(prepare);
    expect(r.store.writes).toBe(0);
  });

  it('the boss gate stays shut in the real game and is open only when the Test Lab unlocks it', () => {
    const shut = rig(true);
    expect(shut.campaign.startMission('oshodi')).toBe(false);
    expect(shut.missionStarts).toHaveLength(0);
    const open = rig(true, true);
    expect(open.campaign.startMission('oshodi')).toBe(true);
    expect(open.missionStarts).toHaveLength(1);
  });
});
