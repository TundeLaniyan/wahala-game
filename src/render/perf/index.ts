/**
 * FlowFrame Performance: the public surface of the adaptive-quality system (see `brand.ts`, docs/FLOWFRAME_PERFORMANCE.md).
 */
export { FLOWFRAME } from './brand';
export type { FlowFrameBrand } from './brand';
export { AdaptiveQuality, DEFAULT_ADAPTIVE, windowStats } from './adaptive';
export type {
  AdaptiveConfig,
  AdaptiveStatus,
  ChangeReason,
  FrameCtx,
  QualityChange,
  WindowStats,
} from './adaptive';
export { deviceFingerprint, detectCapabilities, estimateRung, probeGl, rungForGpu } from './capabilities';
export type { CapabilityEnv, DeviceHints, Estimate, GlProbe } from './capabilities';
export { LEARNED_KEY, loadLearned, saveLearned } from './learned';
