/**
 * The Test Lab's save isolation (docs/TEST_LAB.md, decision TL2): once installed, every write the game makes to
 * `localStorage` lands in memory and never reaches the real storage; only the Test Lab's own feedback key does.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CampaignController } from '../../src/app/campaign';
import type { MissionHost } from '../../src/app/ports';
import { DEFAULT_GAME_SETTINGS, loadSettings, saveSettings } from '../../src/app/settings';
import { createSave, persistSave, loadSave } from '../../src/campaign';
import { FEEDBACK_KEY } from '../../src/testlab/feedbackKey';
import { loadFeedback, saveFeedback, withFeedback } from '../../src/testlab/feedback';
import { createIsolatedStorage, installIsolation, resetIsolationForTests } from '../../src/testlab/isolation';
import type { StorageLike } from '../../src/testlab/isolation';

class RealStore implements StorageLike {
  data = new Map<string, string>();
  writes: string[] = [];
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => {
    this.writes.push(k);
    this.data.set(k, v);
  };
  removeItem = (k: string): void => {
    this.writes.push(k);
    this.data.delete(k);
  };
}

afterEach(() => {
  resetIsolationForTests();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('createIsolatedStorage', () => {
  it('keeps every game key in memory and passes only the feedback key through', () => {
    const real = new RealStore();
    real.data.set('wahala.campaign.v1', 'the player’s real save');
    const store = createIsolatedStorage(real);
    // the real save is not even readable: the lab starts from nothing
    expect(store.getItem('wahala.campaign.v1')).toBeNull();
    store.setItem('wahala.campaign.v1', 'x');
    store.setItem('wahala.settings.v1', 'y');
    store.removeItem('wahala.audio.v1');
    expect(store.getItem('wahala.campaign.v1')).toBe('x');
    expect(real.writes).toEqual([]);
    expect(real.data.get('wahala.campaign.v1')).toBe('the player’s real save');
    store.setItem(FEEDBACK_KEY, '{}');
    expect(real.writes).toEqual([FEEDBACK_KEY]);
    expect(store.dump()).toEqual({ 'wahala.campaign.v1': 'x', 'wahala.settings.v1': 'y' });
  });

  it('works without any real storage (blocked): feedback then lives in memory', () => {
    const store = createIsolatedStorage(null);
    store.setItem(FEEDBACK_KEY, 'a');
    expect(store.getItem(FEEDBACK_KEY)).toBe('a');
  });
});

describe('installIsolation', () => {
  it('replaces window.localStorage; the campaign, settings and audio paths write to memory only', () => {
    const real = new RealStore();
    const win: { localStorage: unknown } = { localStorage: real };
    const iso = installIsolation(win);
    expect(iso.ok).toBe(true);
    expect(win.localStorage).toBe(iso.storage);
    // the campaign save (browserStore() hands out window.localStorage; here the same object)
    const store = win.localStorage as StorageLike;
    expect(persistSave(store, createSave(5))).toBe(true);
    expect(loadSave(store)).not.toBeNull();
    // the saved settings (they read and write globalThis.localStorage)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => win.localStorage });
    saveSettings({ ...DEFAULT_GAME_SETTINGS, muted: true });
    expect(loadSettings().muted).toBe(true);
    expect(real.writes).toEqual([]);
    expect(Object.keys(iso.storage.dump()).sort()).toEqual(['wahala.campaign.v1', 'wahala.settings.v1']);
  });

  it('the feedback is the one thing that reaches the real storage', () => {
    const real = new RealStore();
    const win: { localStorage: unknown } = { localStorage: real };
    installIsolation(win);
    const store = win.localStorage as StorageLike;
    expect(saveFeedback(store, withFeedback({}, 'classicRaid', { status: 'pass', note: 'good' }))).toBe(true);
    expect(real.writes).toEqual([FEEDBACK_KEY]);
    expect(loadFeedback(store).classicRaid).toEqual({ status: 'pass', note: 'good' });
  });

  it('reports failure when the property cannot be replaced (the lab then refuses to start tests)', () => {
    const win = {};
    Object.defineProperty(win, 'localStorage', { value: new RealStore(), configurable: false });
    expect(installIsolation(win).ok).toBe(false);
  });

  it('a campaign controller on the isolated store plays and saves without touching the real one', () => {
    const real = new RealStore();
    const win: { localStorage: unknown } = { localStorage: real };
    installIsolation(win);
    const host: MissionHost = { startMission: () => {}, playRaid: () => {}, stop: () => {} };
    const campaign = new CampaignController({
      store: win.localStorage as StorageLike,
      host,
      now: () => 1,
      seed: () => 3,
      testLabUnlocked: true,
    });
    campaign.load();
    campaign.startNew('hard');
    campaign.setLevel('easy');
    campaign.deleteSave();
    expect(real.writes).toEqual([]);
  });
});
