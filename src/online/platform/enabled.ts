/**
 * Whether this page offers the player-platform features (guest identity, friends, parties, quick signals): a SERVER build
 * made with `WAHALA_PLATFORM_URL` (the build constant) AND the runtime flags (`?online`, a usable endpoint). Online chunk only.
 * Without it the online flow is exactly the guest-only flow it always was.
 */
import { flags } from '../../platform';

/** The build constant, read so that a bundler config without the define (the server's dev client) still runs: false. */
const builtWithPlatform = (): boolean => typeof __WAHALA_PLATFORM__ !== 'undefined' && __WAHALA_PLATFORM__;

/** The hosted private-beta client (build constant, only ever true together with the platform client). */
export function privateBeta(): boolean {
  return builtWithPlatform() && typeof __WAHALA_PRIVATE_BETA__ !== 'undefined' && __WAHALA_PRIVATE_BETA__;
}

export function platformEnabled(): boolean {
  return builtWithPlatform() && flags().platform && flags().platformEndpoint !== null;
}

/** The platform API base URL, or null when the features are off. */
export function platformEndpoint(): string | null {
  return platformEnabled() ? flags().platformEndpoint : null;
}
