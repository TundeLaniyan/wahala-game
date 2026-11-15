/** First-visit onboarding decision and storage (app/onboarding.ts, decisions OB1-OB5). */
import { describe, expect, it } from 'vitest';
import { ONBOARDING_KEY, readOnboarding, shouldOfferOnboarding, writeOnboarding } from '../src/app/onboarding';

class MapStore {
  data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
}

describe('first-visit onboarding', () => {
  it('offers the card on a first visit only', () => {
    expect(shouldOfferOnboarding({ stored: null, automated: false, forced: false })).toBe(true);
    expect(shouldOfferOnboarding({ stored: 'skipped', automated: false, forced: false })).toBe(false);
    expect(shouldOfferOnboarding({ stored: 'tutorial', automated: false, forced: true })).toBe(false);
  });

  it('automation is not offered the card unless the URL forces it', () => {
    expect(shouldOfferOnboarding({ stored: null, automated: true, forced: false })).toBe(false);
    expect(shouldOfferOnboarding({ stored: null, automated: true, forced: true })).toBe(true);
  });

  it('remembers the choice locally and ignores anything else in the slot', () => {
    const store = new MapStore();
    expect(readOnboarding(store)).toBeNull();
    expect(writeOnboarding('skipped', store)).toBe(true);
    expect(store.data.get(ONBOARDING_KEY)).toBe('skipped');
    expect(readOnboarding(store)).toBe('skipped');
    store.setItem(ONBOARDING_KEY, 'nonsense');
    expect(readOnboarding(store)).toBeNull();
  });

  it('blocked storage never throws', () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: (): void => {
        throw new Error('blocked');
      },
    };
    expect(readOnboarding(blocked)).toBeNull();
    expect(writeOnboarding('tutorial', blocked)).toBe(false);
    expect(writeOnboarding('tutorial', null)).toBe(false);
  });
});
