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
import type { MusicManifest, MusicTrack } from './playlist';

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
export function mergeCandidateMusic(
  base: MusicManifest,
  candidates: MusicManifest,
  mode: CandidateMode,
  candidateBaseUrl: string,
): MusicManifest {
  if (!wantsMusic(mode) || candidates.tracks.length === 0) return base;
  const taken = new Set(base.tracks.map((t) => t.id));
  const added: MusicTrack[] = candidates.tracks
    .filter((t) => !taken.has(t.id))
    .map((t) => ({ ...t, candidate: true, url: candidateBaseUrl + t.file }));
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
  return {
    version: 2,
    tracks: [...base.tracks, ...added],
    playlists: { default: def, arenas },
    menu: wantsMenu(mode) && menu.length > 0 ? menu : base.menu,
  };
}
