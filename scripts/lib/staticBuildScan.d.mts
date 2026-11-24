export type Rule = readonly [string, RegExp];
export interface Problem {
  file: string;
  rule: string;
  sample: string;
}
export const API_RULES: readonly Rule[];
export const ONLINE_CHUNK_MARKERS: readonly Rule[];
export const ONLINE_ENTRY_MARKERS: readonly Rule[];
export const ADDRESS_RULES: readonly Rule[];
export const ALLOWED_ABSOLUTE_HOSTS: Readonly<Record<string, string>>;
export const SERVER_TEMPLATE: string;
export function filesUnder(dir: string, re?: RegExp): string[];
export function scanBuild(
  dir: string,
  options?: {
    api?: boolean;
    markers?: readonly (readonly Rule[])[];
    addresses?: boolean;
    skip?: (relativeFile: string) => boolean;
    transform?: (src: string) => string;
  },
): Problem[];
export function absoluteUrls(src: string): { url: string; host: string }[];
