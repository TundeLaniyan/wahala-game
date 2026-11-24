/** Local movement prediction of the online match driver (decisions ON4-ON5, docs/ONLINE_PREDICTION.md). */
export { DEFAULT_PREDICTION, predictionConfig, predictionFromSearch } from './config';
export type { PredictionConfig } from './config';
export { drawnPosition, encodeDrawn } from './drawn';
export type { StepFields } from './drawn';
export { OverlayLeakError, PlayerOverlay } from './overlay';
export { LocalPredictor } from './predictor';
export type { PredictionMode, PredictionStats } from './predictor';
