import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request ambient data (the request id), so audit rows and logs correlate without threading a parameter everywhere. */
export interface RequestContext {
  requestId: string;
}
export const requestContext = new AsyncLocalStorage<RequestContext>();
export const currentRequestId = (): string | null => requestContext.getStore()?.requestId ?? null;
