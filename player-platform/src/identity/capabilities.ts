import type { AgeGroup, Capabilities, PlayerKind } from './types';

/**
 * Feature gating by account kind and self-declared age band. Conservative by default: `unspecified` is treated like a minor,
 * because a guest-first game cannot assume an adult. This is a PRODUCT / LEGAL policy placeholder
 * (docs/PLATFORM_PRIVACY.md): the numbers of the Nigeria Data Protection Act position on children's consent must be
 * confirmed by counsel before public launch. Never relies on a client claim for anything beyond the declared band.
 */
export function capabilitiesFor(kind: PlayerKind, age: AgeGroup): Capabilities {
  const adult = age === 'adult';
  return {
    // unrestricted text and voice need an adult AND a registered (recoverable, reportable) account
    textChat: adult && kind === 'registered',
    voice: adult && kind === 'registered',
    // purchases need an adult registered account; a guardian-consent flow for minors is NOT built
    purchases: adult && kind === 'registered',
    friendCodeOnly: true,
  };
}
