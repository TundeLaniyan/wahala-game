/**
 * The music playlist model: which licensed tracks exist (public/audio/music/manifest.json), which
 * arena plays which of them, and the per-match rotation rule. Pure (no Web Audio, no DOM) so it is
 * unit-tested directly; `music.ts` does the playback.
 *
 * Rules:
 *  - A track is usable only if its manifest entry is well formed (safe id and file name) and names a
 *    licence. Whether its FILE exists is decided at runtime (`isAvailable`): missing files are skipped.
 *  - Each arena plays its own playlist (default: the manifest's `default` list, i.e. all approved
 *    tracks). An arena may name a `signature` track; when that track is available it always plays there.
 *  - An arena may name a `start` track: the FIRST match on that arena in a session opens with it (when
 *    it is available and was not the track just heard); later matches rotate.
 *  - Otherwise a match picks uniformly from the available tracks of the arena's playlist, never the
 *    previous match's track while another one is available (no immediate repeat).
 */
import type { Rand } from './rng';

export interface MusicTrack {
  /** `[A-Za-z0-9_-]+`, e.g. `pixabay_569473`. */
  id: string;
  title: string;
  /** Author as credited on the source page (null while unknown). */
  artist: string | null;
  /** Source page the file came from. */
  source: string;
  /** Licence name, e.g. "Pixabay Content License". Tracks without one are ignored. */
  licence: string;
  licenceUrl?: string;
  /** File name inside public/audio/music/ (no folders). */
  file: string;
  /** The Data Saver variant (`lite/<file>`, 96 kbps), when one ships; played only with Data Saver on. */
  lite?: string;
  /** Loudness trim for this track (default 1, clamped to 0..2). */
  gain: number;
  /**
   * Full URL of the file. Set ONLY by `mergeCandidateMusic` (candidates.ts) for unapproved audition tracks; a manifest
   * can never supply it (`parseMusicManifest` does not read it), so approved files always come from public/audio/music/.
   */
  url?: string;
  /** True for an unapproved audition track added by the `?audiodraft` overlay; absent for every shipped track. */
  candidate?: boolean;
  /** Candidate only (set by the merge): the Data Saver file's full URL. */
  liteUrl?: string;
  /**
   * Tracks with the same group have the same length and bar grid, so a variant can take over from another one at the
   * same playback position (Sudden Death, boss levels). Set by the manifest or, for candidates, by the merge.
   */
  syncGroup?: string;
  /** Where in the file playback starts (seconds, on a bar line). Lets one file give distinct variants. */
  startAt?: number;
  /**
   * The track's bar grid in file time (tempo and the first bar line). Two tracks of the same family
   * with grids can hand over on the same beat even when they are not the same recording (Sudden Death loops).
   */
  grid?: { bpm: number; first: number };
  /** Tracks of one family share a song (and its Sudden Death loop). */
  family?: string;
}

/** Music variants the match soundtrack can switch to as the game state changes (candidates only, see candidates.ts). */
export interface MusicVariants {
  suddenDeath?: string;
  /** Boss levels 1..3 (stalking, engaged, all-out), by track id. */
  boss?: string[];
  /** Sudden Death loop per track family (a district song's own intensified loop on its own tempo). */
  suddenDeathFor?: Record<string, string>;
}

export interface ArenaPlaylist {
  /** Track ids this arena rotates through (default: the `default` list). */
  tracks?: string[];
  /** A track that always plays on this arena while it is available (takes priority over rotation). */
  signature?: string | null;
  /** The track the first match on this arena (per session) opens with. */
  start?: string | null;
  /**
   * Tracks to use ONLY when none of the arena's own `tracks` is available (file missing or failed), before the
   * manifest's default pool. Lets an arena keep its previous licensed song as a safety net behind a newer one.
   */
  fallback?: string[];
}

export interface MusicManifest {
  version: 2;
  tracks: MusicTrack[];
  playlists: {
    default: string[];
    arenas: Record<string, ArenaPlaylist>;
  };
  /** Track ids for the title / menu screens (empty: the menus are silent). */
  menu: string[];
  /** Music variants (Sudden Death, boss levels) by track id; the parser keeps only ids that are listed tracks. */
  variants?: MusicVariants;
}

export const SAFE_TRACK_ID = /^[A-Za-z0-9_-]+$/;
export const SAFE_MUSIC_FILE = /^[A-Za-z0-9_-]+\.(mp3|ogg|m4a)$/;
export const SAFE_LITE_FILE = /^lite\/[A-Za-z0-9_-]+\.(mp3|ogg|m4a)$/;

export const EMPTY_MANIFEST: MusicManifest = {
  version: 2,
  tracks: [],
  playlists: { default: [], arenas: {} },
  menu: [],
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const ids = (v: unknown, known: Set<string>): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && known.has(x)))] : [];

/**
 * Validates a raw manifest. Malformed or unlicensed tracks are dropped (with a reason), playlist
 * entries that name unknown tracks are dropped. Never throws.
 */
export function parseMusicManifest(raw: unknown): {
  manifest: MusicManifest;
  rejected: { track: string; reason: string }[];
} {
  const rejected: { track: string; reason: string }[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null || !Array.isArray(r.tracks)) {
    return { manifest: EMPTY_MANIFEST, rejected };
  }
  const tracks: MusicTrack[] = [];
  for (const t of r.tracks as unknown[]) {
    const e = (t ?? {}) as Record<string, unknown>;
    const id = str(e.id) ?? '?';
    if (!SAFE_TRACK_ID.test(id)) rejected.push({ track: id, reason: 'unsafe or missing id' });
    else if (tracks.some((x) => x.id === id)) rejected.push({ track: id, reason: 'duplicate id' });
    else if (!str(e.licence)) rejected.push({ track: id, reason: 'missing licence' });
    else if (typeof e.file !== 'string' || !SAFE_MUSIC_FILE.test(e.file)) {
      rejected.push({ track: id, reason: `unsafe file name ${String(e.file)}` });
    } else {
      const gain =
        typeof e.gain === 'number' && Number.isFinite(e.gain) ? Math.min(2, Math.max(0, e.gain)) : 1;
      const num = (v: unknown): number | undefined =>
        typeof v === 'number' && Number.isFinite(v) ? v : undefined;
      const g = (e.grid ?? {}) as Record<string, unknown>;
      const bpm = num(g.bpm);
      const first = num(g.first);
      const startAt = num(e.startAt);
      const sync = str(e.syncGroup);
      const family = str(e.family);
      tracks.push({
        id,
        title: str(e.title) ?? id,
        artist: str(e.artist),
        source: str(e.source) ?? '',
        licence: str(e.licence)!,
        licenceUrl: str(e.licenceUrl) ?? undefined,
        file: e.file,
        lite: typeof e.lite === 'string' && SAFE_LITE_FILE.test(e.lite) ? e.lite : undefined,
        gain,
        // optional playback metadata (bar grid, start offset, song family, sync group); malformed values are dropped
        ...(startAt !== undefined && startAt >= 0 ? { startAt } : {}),
        ...(bpm !== undefined && first !== undefined && bpm >= 40 && bpm <= 240 && first >= 0
          ? { grid: { bpm, first } }
          : {}),
        ...(family && SAFE_TRACK_ID.test(family) ? { family } : {}),
        ...(sync && SAFE_TRACK_ID.test(sync) ? { syncGroup: sync } : {}),
      });
    }
  }
  const known = new Set(tracks.map((t) => t.id));
  const pl = (r.playlists ?? {}) as Record<string, unknown>;
  const def = pl.default === undefined ? tracks.map((t) => t.id) : ids(pl.default, known);
  const arenas: Record<string, ArenaPlaylist> = {};
  const rawArenas = pl.arenas;
  if (typeof rawArenas === 'object' && rawArenas !== null && !Array.isArray(rawArenas)) {
    for (const [arena, v] of Object.entries(rawArenas as Record<string, unknown>)) {
      const a = (v ?? {}) as Record<string, unknown>;
      const sig = str(a.signature);
      const start = str(a.start);
      arenas[arena] = {
        tracks: a.tracks === undefined ? undefined : ids(a.tracks, known),
        signature: sig && known.has(sig) ? sig : null,
        start: start && known.has(start) ? start : null,
        ...(a.fallback === undefined ? {} : { fallback: ids(a.fallback, known) }),
      };
    }
  }
  const variants = parseVariants(r.variants, known);
  return {
    manifest: {
      version: 2,
      tracks,
      playlists: { default: def, arenas },
      menu: ids(r.menu, known),
      ...(variants ? { variants } : {}),
    },
    rejected,
  };
}

function parseVariants(raw: unknown, known: Set<string>): MusicVariants | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  const out: MusicVariants = {};
  const sd = str(v.suddenDeath);
  if (sd && known.has(sd)) out.suddenDeath = sd;
  // the boss levels are positional (1..3): keep the list only when every level is a listed track
  if (
    Array.isArray(v.boss) &&
    v.boss.length > 0 &&
    v.boss.every((b) => typeof b === 'string' && known.has(b))
  ) {
    out.boss = v.boss as string[];
  }
  if (typeof v.suddenDeathFor === 'object' && v.suddenDeathFor !== null && !Array.isArray(v.suddenDeathFor)) {
    const m = Object.entries(v.suddenDeathFor as Record<string, unknown>).filter(
      ([fam, id]) => SAFE_TRACK_ID.test(fam) && typeof id === 'string' && known.has(id),
    );
    if (m.length > 0) out.suddenDeathFor = Object.fromEntries(m) as Record<string, string>;
  }
  return out.suddenDeath || out.boss || out.suddenDeathFor ? out : undefined;
}

/** The ids an arena rotates through (its own list, else the default list). */
export function playlistFor(m: MusicManifest, arenaId?: string | null): string[] {
  const a = arenaId ? m.playlists.arenas[arenaId] : undefined;
  return a?.tracks && a.tracks.length > 0 ? a.tracks : m.playlists.default;
}

export interface PickOptions {
  arenaId?: string | null;
  /** The previous match's track (avoided while another candidate is available). */
  previous: string | null;
  isAvailable: (id: string) => boolean;
  rand: Rand;
  /** Extra ids to skip (e.g. a track that just failed to play). */
  exclude?: ReadonlySet<string>;
  /** True for the first match on this arena in the session (its `start` track opens it). */
  firstOnArena?: boolean;
}

/** Chooses the track for the next match, or null when no listed track is available. */
export function pickMatchTrack(m: MusicManifest, o: PickOptions): string | null {
  const ok = (id: string): boolean => !o.exclude?.has(id) && o.isAvailable(id);
  const sig = o.arenaId ? m.playlists.arenas[o.arenaId]?.signature : null;
  if (sig && ok(sig)) return sig;
  const start = o.arenaId ? m.playlists.arenas[o.arenaId]?.start : null;
  if (o.firstOnArena && start && ok(start) && start !== o.previous) return start;
  const own = pickFrom(playlistFor(m, o.arenaId).filter(ok), o.previous, o.rand);
  if (own !== null) return own;
  // the arena's own song(s) are unavailable: its declared fallback(s), then (as before) the default pool is NOT used
  // unless a fallback list asked for it, so an arena without one keeps its documented behaviour
  const fb = o.arenaId ? m.playlists.arenas[o.arenaId]?.fallback : undefined;
  if (!fb) return own;
  return (
    pickFrom(fb.filter(ok), o.previous, o.rand) ??
    pickFrom(m.playlists.default.filter(ok), o.previous, o.rand)
  );
}

/** Uniform choice from `candidates`, avoiding `previous` when anything else is left. */
export function pickFrom(candidates: readonly string[], previous: string | null, rand: Rand): string | null {
  const fresh = candidates.length > 1 ? candidates.filter((id) => id !== previous) : [...candidates];
  if (fresh.length === 0) return null;
  const i = Math.min(fresh.length - 1, Math.floor(rand() * fresh.length));
  return fresh[i]!;
}
