/**
 * First-visit onboarding (decisions OB1-OB5, docs/IMPLEMENTATION_STATUS.md): a new player is offered START TUTORIAL or
 * SKIP TO MENU once; the choice is remembered in localStorage (no cookies, nothing sent anywhere) and a returning player
 * goes straight to Home. Learn to Play stays on Home either way.
 *
 * Automated browsers (`navigator.webdriver`) are not offered the card unless the URL asks for it with `?onboarding`, so
 * the existing browser suite keeps starting on Home; `e2e/onboarding.spec.ts` forces it to test the flow itself.
 */
export const ONBOARDING_KEY = 'wahala.onboarding.v1';

/** What the player chose the first time ('tutorial' = START TUTORIAL, 'skipped' = SKIP TO MENU). */
export type OnboardingChoice = 'tutorial' | 'skipped';

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): Store | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The stored choice, or null for a first visit (also null when storage is blocked or holds anything else). */
export function readOnboarding(store: Store | null = browserStorage()): OnboardingChoice | null {
  try {
    const v = store?.getItem(ONBOARDING_KEY) ?? null;
    return v === 'tutorial' || v === 'skipped' ? v : null;
  } catch {
    return null;
  }
}

/** Remembers the choice. False when storage is unavailable (the card then simply shows again next visit). */
export function writeOnboarding(choice: OnboardingChoice, store: Store | null = browserStorage()): boolean {
  try {
    if (!store) return false;
    store.setItem(ONBOARDING_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/** Pure decision: offer the card on a first visit, except to automation unless `?onboarding` forces it. */
export function shouldOfferOnboarding(o: {
  stored: OnboardingChoice | null;
  automated: boolean;
  forced: boolean;
}): boolean {
  if (o.stored !== null) return false;
  return o.forced || !o.automated;
}

/** The decision for this page load (browser only; false outside a browser). */
export function offerOnboardingNow(): boolean {
  if (typeof window === 'undefined') return false;
  let forced: boolean;
  try {
    forced = new URLSearchParams(window.location.search).has('onboarding');
  } catch {
    forced = false;
  }
  const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
  return shouldOfferOnboarding({ stored: readOnboarding(), automated, forced });
}
