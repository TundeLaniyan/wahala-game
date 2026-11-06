export type { NarrationClip, NarrationProvider, NarrationSource, NarrationTier, PlayResult } from './types';
export { NARRATION_CATALOGUE, NARRATION_CLIPS, NARRATION_DIR, createCatalogue } from './catalogue';
export type { NarrationCatalogue } from './catalogue';
export { FreeEntitlements, clipAllowed, safeHas } from './entitlements';
export type { Entitlement, EntitlementPort } from './entitlements';
export { FileNarrationProvider, NullNarrationProvider, clipUrl } from './provider';
export type { ClipPort, FileNarrationDeps } from './provider';
