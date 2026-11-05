import { baseNodeView } from '../ctx';
import type { Objective } from './types';

/**
 * Section field missions are not run by this table: `runtime.ts` hands them to `field.ts` before any objective is asked.
 * The entry only keeps `OBJECTIVES` total over `ObjectiveKind`, and answers harmlessly if something ever does ask.
 */
export const fieldRoute: Objective = {
  label: 'route legs',
  setup: () => undefined,
  update: () => undefined,
  done: () => 0,
  nodeView: (_ctx, node) => baseNodeView(node, 1),
  runnerTarget: () => null,
};
