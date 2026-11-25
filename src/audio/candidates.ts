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

/**
 * What `?audiodraft=<mode>` turns on. A bare `?audiodraft` is `all`.
 *  - `menu`: the Lagos No Dey Sleep menu instrumental.
 *  - `match`: the seven district songs on their City Rumble arenas (and the proposed standard arenas), with Sudden Death
 *    and boss variants. Arenas the candidate map does not list keep their shipped (Pixabay) track.
 *  - `lnds`: the Lagos No Dey Sleep City Rumble mix on EVERY arena (the earlier audition), with its variants.
 *  - `stings`: the candidate victory / defeat stingers.
 */
export type CandidateMode = 'off' | 'menu' | 'match' | 'lnds' | 'stings' | 'all';

/** Folder (inside the audio base URL) the staged candidate files and their two manifests live in. */
export const CANDIDATE_DIR = 'candidates/';

export function candidateModeFromSearch(search: string): CandidateMode {
  const q = new URLSearchParams(search);
  if (!q.has('audiodraft')) return 'off';
  const v = (q.get('audiodraft') ?? '').trim().toLowerCase();
  if (v === 'menu' || v === 'match' || v === 'lnds' || v === 'stings') return v;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return 'off';
  return 'all';
}

export const wantsMenu = (m: CandidateMode): boolean => m === 'menu' || m === 'all';
export const wantsDistricts = (m: CandidateMode): boolean => m === 'match' || m === 'all';
export const wantsLnds = (m: CandidateMode): boolean => m === 'lnds';
export const wantsStings = (m: CandidateMode): boolean => m === 'stings' || m === 'all';
/** True when the candidate MUSIC manifest has to be fetched at all. */
export const wantsMusic = (m: CandidateMode): boolean => wantsMenu(m) || wantsDistricts(m) || wantsLnds(m);

/** The candidate manifest's extra, optional fields (not part of the shipped schema). */
export interface CandidateExtras {
  syncGroups: Record<string, string>;
  variants: MusicVariants;
  /** Per track: start offset, bar grid and family (all optional). */
  trackMeta: Record<string, { startAt?: number; grid?: { bpm: number; first: number }; family?: string }>;
  /** Arena id -> the candidate tracks it rotates through, and the one the first match opens with. */
  arenaMap: Record<string, { tracks: string[]; start?: string }>;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const isId = (v: unknown): v is string => typeof v === 'string' && SAFE_ID.test(v);
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;

/** Reads the extras from a raw candidate manifest. Never throws; anything odd is ignored. */
export function parseCandidateExtras(raw: unknown): CandidateExtras {
  const r = obj(raw);
  const syncGroups: Record<string, string> = {};
  for (const [id, g] of Object.entries(obj(r.syncGroups))) if (isId(id) && isId(g)) syncGroups[id] = g;
  const v = obj(r.variants);
  const variants: MusicVariants = {};
  if (isId(v.suddenDeath)) variants.suddenDeath = v.suddenDeath;
  if (Array.isArray(v.boss) && v.boss.length > 0 && v.boss.every(isId)) variants.boss = v.boss as string[];
  const sdf: Record<string, string> = {};
  for (const [fam, id] of Object.entries(obj(v.suddenDeathFor))) if (isId(fam) && isId(id)) sdf[fam] = id;
  if (Object.keys(sdf).length > 0) variants.suddenDeathFor = sdf;
  const trackMeta: CandidateExtras['trackMeta'] = {};
  if (Array.isArray(r.tracks)) {
    for (const t of r.tracks) {
      const e = obj(t);
      if (!isId(e.id)) continue;
      const g = obj(e.grid);
      const bpm = num(g.bpm, 40, 240);
      const first = num(g.first, 0, 120);
      trackMeta[e.id] = {
        startAt: num(e.startAt, 0, 900),
        grid: bpm !== undefined && first !== undefined ? { bpm, first } : undefined,
        family: isId(e.family) ? e.family : undefined,
      };
    }
  }
  const arenaMap: CandidateExtras['arenaMap'] = {};
  for (const [arena, e] of Object.entries(obj(r.arenaMap))) {
    const o = obj(e);
    if (!isId(arena) || !Array.isArray(o.tracks)) continue;
    const tracks = o.tracks.filter(isId);
    if (tracks.length > 0) arenaMap[arena] = { tracks, start: isId(o.start) ? o.start : undefined };
  }
  return { syncGroups, variants, trackMeta, arenaMap };
}

const NO_EXTRAS: CandidateExtras = { syncGroups: {}, variants: {}, trackMeta: {}, arenaMap: {} };

/**
 * Returns `base` plus the candidate tracks, with the menu and the arenas pointed at them as the mode asks.
 * `base` is never mutated; with a mode that wants no music (or an empty candidate manifest) `base` itself is
 * returned, so the default game is byte-for-byte what it was. A shipped track is never replaced: a candidate with the
 * same id is dropped, and an arena the map does not list keeps its playlist (the Pixabay fallbacks stay).
 *
 * `candidateBaseUrl` is where the candidate files are served from (ends with `/`). Candidate tracks keep their file
 * name check from `parseMusicManifest`; their `url` is set here and can never come from a manifest.
 */
export function mergeCandidateMusic(
  base: MusicManifest,
  candidates: MusicManifest,
  mode: CandidateMode,
  candidateBaseUrl: string,
  extras: CandidateExtras = NO_EXTRAS,
): MusicManifest {
  if (!wantsMusic(mode) || candidates.tracks.length === 0) return base;
  const taken = new Set(base.tracks.map((t) => t.id));
  const added: MusicTrack[] = candidates.tracks
    .filter((t) => !taken.has(t.id))
    .map((t) => {
      const meta = extras.trackMeta[t.id];
      return {
        ...t,
        candidate: true,
        url: candidateBaseUrl + t.file,
        liteUrl: t.lite ? candidateBaseUrl + t.lite : undefined,
        syncGroup: extras.syncGroups[t.id],
        startAt: meta?.startAt,
        grid: meta?.grid,
        family: meta?.family,
      };
    });
  if (added.length === 0) return base;
  const known = new Set(added.map((t) => t.id));
  const menu = candidates.menu.filter((id) => known.has(id));
  const lnds = candidates.playlists.default.filter((id) => known.has(id));

  const arenas = { ...base.playlists.arenas };
  let def = base.playlists.default;
  let anyMatch = false;
  if (wantsLnds(mode) && lnds.length > 0) {
    // an audition: the candidate is the signature of EVERY arena, so any stage can be used to hear it
    for (const id of Object.keys(arenas)) arenas[id] = { tracks: lnds, signature: lnds[0]!, start: lnds[0]! };
    def = lnds;
    anyMatch = true;
  }
  if (wantsDistricts(mode)) {
    for (const [arena, e] of Object.entries(extras.arenaMap)) {
      const ids = e.tracks.filter((id) => known.has(id));
      if (ids.length === 0) continue;
      // no signature: the first match opens `start`, later matches rotate, never the same track twice in a row
      arenas[arena] = {
        tracks: ids,
        signature: null,
        start: e.start && ids.includes(e.start) ? e.start : ids[0]!,
        ...(arenas[arena]?.fallback ? { fallback: arenas[arena]!.fallback } : {}),
      };
      anyMatch = true;
    }
  }
  const variants: MusicVariants = { ...base.variants }; // the shipped variants stay unless a candidate one replaces them
  if (anyMatch) {
    if (extras.variants.suddenDeath && known.has(extras.variants.suddenDeath)) {
      variants.suddenDeath = extras.variants.suddenDeath;
    }
    if (extras.variants.boss?.every((id) => known.has(id))) variants.boss = extras.variants.boss;
    const sdf = Object.entries(extras.variants.suddenDeathFor ?? {}).filter(([, id]) => known.has(id));
    if (sdf.length > 0) variants.suddenDeathFor = Object.fromEntries(sdf);
  }
  return {
    version: 2,
    tracks: [...base.tracks, ...added],
    playlists: { default: def, arenas },
    menu: wantsMenu(mode) && menu.length > 0 ? menu : base.menu,
    ...(variants.suddenDeath || variants.boss || variants.suddenDeathFor ? { variants } : {}),
  };
}
