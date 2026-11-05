import type { ObjectiveKind } from '../types';
import { contingencyGrid } from './grid';
import { dispatchRelays } from './relays';
import { dispatchWindows } from './windows';
import { fieldRoute } from './fieldRoute';
import { evidenceRun } from './evidence';
import { junctionAccess } from './junction';
import { supplyRoutes } from './supply';
import type { Objective } from './types';

export type { Objective } from './types';

/** One implementation per objective verb. */
export const OBJECTIVES: Readonly<Record<ObjectiveKind, Objective>> = {
  dispatchRelays,
  supplyRoutes,
  junctionAccess,
  evidenceRun,
  contingencyGrid,
  dispatchWindows,
  fieldRoute,
};
