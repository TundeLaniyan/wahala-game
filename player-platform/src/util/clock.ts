/** Time is injected so expiry, rotation and rate limits are testable without sleeping. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
