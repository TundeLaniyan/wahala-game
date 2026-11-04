import { describe, expect, it } from 'vitest';
import { AD_FORBIDDEN_SURFACES, AD_PLACEMENT_RULES, NullAdProvider, canShowAd } from '../../src/ads';
import type { AdContext, AdSlot, AdSurface } from '../../src/ads';

const SURFACES: AdSurface[] = [
  'matchResults',
  'mainMenu',
  'lobby',
  'settings',
  'liveMatch',
  'countdown',
  'pauseMenu',
  'tutorial',
  'campaignMap',
  'campaignBriefing',
  'bossIntro',
  'cutscene',
  'campaignResult',
];
const SLOTS: AdSlot[] = ['postMatch', 'betweenMatchMenu', 'rewarded'];

const ctx = (over: Partial<AdContext> = {}): AdContext => ({
  slot: 'postMatch',
  surface: 'matchResults',
  adsEnabled: true,
  adFree: false,
  optedIn: false,
  ...over,
});

describe('ad placement rules', () => {
  it('ads may appear on the post-match results screen, between matches, and as an opt-in reward', () => {
    expect(canShowAd(ctx())).toEqual({ allowed: true });
    expect(canShowAd(ctx({ slot: 'betweenMatchMenu', surface: 'mainMenu' }))).toEqual({ allowed: true });
    expect(canShowAd(ctx({ slot: 'betweenMatchMenu', surface: 'lobby' }))).toEqual({ allowed: true });
    expect(canShowAd(ctx({ slot: 'rewarded', surface: 'matchResults', optedIn: true }))).toEqual({
      allowed: true,
    });
    expect(canShowAd(ctx({ slot: 'rewarded', surface: 'mainMenu', optedIn: true }))).toEqual({
      allowed: true,
    });
  });

  it('NEVER during a match, countdown, pause menu, tutorial, campaign briefing, boss intro or cutscene', () => {
    for (const surface of [
      'liveMatch',
      'countdown',
      'pauseMenu',
      'tutorial',
      'campaignBriefing',
      'bossIntro',
      'cutscene',
    ] as AdSurface[]) {
      for (const slot of SLOTS) {
        expect(canShowAd(ctx({ slot, surface, optedIn: true })), `${slot} on ${surface}`).toEqual({
          allowed: false,
          reason: 'forbiddenSurface',
        });
      }
    }
    // the rest of the campaign is also default-deny
    for (const surface of ['campaignMap', 'campaignResult'] as AdSurface[]) {
      for (const slot of SLOTS) expect(canShowAd(ctx({ slot, surface, optedIn: true })).allowed).toBe(false);
    }
  });

  it('exhaustive: every slot x surface is allowed only where the rule table says so', () => {
    for (const slot of SLOTS) {
      for (const surface of SURFACES) {
        const rule = AD_PLACEMENT_RULES[slot];
        const expected = rule.allowedSurfaces.includes(surface) && !AD_FORBIDDEN_SURFACES.includes(surface);
        expect(canShowAd(ctx({ slot, surface, optedIn: true })).allowed, `${slot} on ${surface}`).toBe(
          expected,
        );
      }
    }
  });

  it('the rule table never lists a forbidden surface', () => {
    for (const rule of Object.values(AD_PLACEMENT_RULES)) {
      for (const s of rule.allowedSurfaces) expect(AD_FORBIDDEN_SURFACES).not.toContain(s);
    }
  });

  it('rewarded ads need an explicit opt-in', () => {
    expect(canShowAd(ctx({ slot: 'rewarded', optedIn: false }))).toEqual({
      allowed: false,
      reason: 'optInRequired',
    });
    expect(canShowAd(ctx({ slot: 'rewarded', optedIn: undefined }))).toEqual({
      allowed: false,
      reason: 'optInRequired',
    });
  });

  it('the global switch and the ad-free premium flag win over everything', () => {
    expect(canShowAd(ctx({ adsEnabled: false }))).toEqual({ allowed: false, reason: 'adsDisabled' });
    expect(canShowAd(ctx({ adFree: true }))).toEqual({ allowed: false, reason: 'adFree' });
    expect(canShowAd(ctx({ slot: 'rewarded', optedIn: true, adFree: true })).allowed).toBe(false);
  });

  it('frequency cap: not again too soon', () => {
    expect(canShowAd(ctx({ secondsSinceLastAd: 10 }))).toEqual({ allowed: false, reason: 'tooSoon' });
    expect(canShowAd(ctx({ secondsSinceLastAd: AD_PLACEMENT_RULES.postMatch.minIntervalSec }))).toEqual({
      allowed: true,
    });
    expect(canShowAd(ctx({ secondsSinceLastAd: undefined }))).toEqual({ allowed: true });
  });

  it('an unknown slot or surface is denied (default deny)', () => {
    expect(canShowAd(ctx({ slot: 'banner' as AdSlot })).allowed).toBe(false);
    expect(canShowAd(ctx({ surface: 'somewhereNew' as AdSurface })).allowed).toBe(false);
  });
});

describe('NullAdProvider', () => {
  it('is disabled and shows nothing, whatever it is asked', async () => {
    expect(NullAdProvider.status).toBe('disabled');
    for (const slot of SLOTS) {
      expect(
        await NullAdProvider.show(
          { slot, surface: 'matchResults' },
          { adsEnabled: true, adFree: false, optedIn: true },
        ),
      ).toEqual({
        shown: false,
        reason: 'noProvider',
      });
    }
  });
});
