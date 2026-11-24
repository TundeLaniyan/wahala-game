/**
 * Founder-audition overlay for UNAPPROVED candidate audio (decision AU1, docs/AUDIO_INTEGRATION.md).
 *
 * The WAHALA! original-theme drafts (menu loop, a premixed City Rumble loop, victory / defeat stingers) are
 * synthesised drafts awaiting the founder's listening approval. They are NOT part of the shipped soundtrack and
 * never replace anything by default:
 *
 *  - Nothing here does anything unless the URL has `?audiodraft` (see `candidateModeFromSearch`).
 *  - The files are not committed under public/ (that folder is guarded by tests/audio/assets.test.ts). They live in
 *    tools/audio/candidates/ and are copied to the git-ignored public/audio/candidates/ by
 *    `npm run audio:stage-candidates` for local or preview auditioning. A build without staged files is inert.
 *  - Candidate tracks only ADD to the approved manifest; they are marked `candidate` and carry their own URL.
 *
 * Pure (no Web Audio, no DOM): the merge is unit-tested directly.
 */
import type { MusicManifest, MusicTrack, MusicVariants } from './playlist';

/** What `?audiodraft=<mode>` turns on. A bare `?audiodraft` is `all`. */
export type CandidateMode = 'off' | 'menu' | 'match' | 'stings' | 'all';

/** Folder (inside the audio base URL) the staged candidate files and their two manifests live in. */
export const CANDIDATE_DIR = 'candidates/';

export function candidateModeFromSearch(search: string): CandidateMode {
  const q = new URLSearchParams(search);
  if (!q.has('audiodraft')) return 'off';
  const v = (q.get('audiodraft') ?? '').trim().toLowerCase();
  if (v === 'menu' || v === 'match' || v === 'stings') return v;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return 'off';
  return 'all';
}

export const wantsMenu = (m: CandidateMode): boolean => m === 'menu' || m === 'all';
export const wantsMatch = (m: CandidateMode): boolean => m === 'match' || m === 'all';
export const wantsStings = (m: CandidateMode): boolean => m === 'stings' || m === 'all';
/** True when the candidate MUSIC manifest has to be fetched at all. */
export const wantsMusic = (m: CandidateMode): boolean => wantsMenu(m) || wantsMatch(m);

/**
 * Returns `base` plus the candidate tracks, with the menu and/or every arena pointed at them as the mode asks.
 * `base` is never mutated; with a mode that wants no music (or an empty candidate manifest) `base` itself is
 * returned, so the default game is byte-for-byte what it was.
 *
 * `candidateBaseUrl` is where the candidate files are served from (ends with `/`). Candidate tracks keep their file
 * name check from `parseMusicManifest`; their `url` is set here and can never come from a manifest.
 */
/** The candidate manifest's extra, optional fields (not part of the shipped schema): sync groups and variants. */
export interface CandidateExtras {
  syncGroups: Record<string, string>;
  variants: MusicVariants;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const isId = (v: unknown): v is string => typeof v === 'string' && SAFE_ID.test(v);

/** Reads `syncGroups` and `variants` from a raw candidate manifest. Never throws; anything odd is ignored. */
export function parseCandidateExtras(raw: unknown): CandidateExtras {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const syncGroups: Record<string, string> = {};
  const sg = r.syncGroups;
  if (typeof sg === 'object' && sg !== null && !Array.isArray(sg)) {
    for (const [id, g] of Object.entries(sg)) if (isId(id) && isId(g)) syncGroups[id] = g;
  }
  const v = (typeof r.variants === 'object' && r.variants !== null ? r.variants : {}) as Record<
    string,
    unknown
  >;
  const variants: MusicVariants = {};
  if (isId(v.suddenDeath)) variants.suddenDeath = v.suddenDeath;
  if (Array.isArray(v.boss) && v.boss.length > 0 && v.boss.every(isId)) variants.boss = v.boss as string[];
  return { syncGroups, variants };
}

export function mergeCandidateMusic(
  base: MusicManifest,
  candidates: MusicManifest,
  mode: CandidateMode,
  candidateBaseUrl: string,
  extras: CandidateExtras = { syncGroups: {}, variants: {} },
): MusicManifest {
  if (!wantsMusic(mode) || candidates.tracks.length === 0) return base;
  const taken = new Set(base.tracks.map((t) => t.id));
  const added: MusicTrack[] = candidates.tracks
    .filter((t) => !taken.has(t.id))
    .map((t) => ({
      ...t,
      candidate: true,
      url: candidateBaseUrl + t.file,
      liteUrl: t.lite ? candidateBaseUrl + t.lite : undefined,
      syncGroup: extras.syncGroups[t.id],
    }));
  if (added.length === 0) return base;
  const known = new Set(added.map((t) => t.id));
  const menu = candidates.menu.filter((id) => known.has(id));
  const match = candidates.playlists.default.filter((id) => known.has(id));

  const arenas = { ...base.playlists.arenas };
  let def = base.playlists.default;
  if (wantsMatch(mode) && match.length > 0) {
    // an audition: the candidate is the signature of EVERY arena, so any stage can be used to hear it
    for (const id of Object.keys(arenas))
      arenas[id] = { tracks: match, signature: match[0]!, start: match[0]! };
    def = match;
  }
  const variants: MusicVariants = {};
  if (wantsMatch(mode) && match.length > 0) {
    if (extras.variants.suddenDeath && known.has(extras.variants.suddenDeath)) {
      variants.suddenDeath = extras.variants.suddenDeath;
    }
    if (extras.variants.boss?.every((id) => known.has(id))) variants.boss = extras.variants.boss;
  }
  return {
    version: 2,
    tracks: [...base.tracks, ...added],
    playlists: { default: def, arenas },
    menu: wantsMenu(mode) && menu.length > 0 ? menu : base.menu,
    ...(variants.suddenDeath || variants.boss ? { variants } : {}),
  };
}
