/**
 * Guards the founder's decisions on shipped audio:
 *  - the synthetic Afrobeats music, the Kokoro TTS Pidgin voices and the generated Lagos ambience beds of
 *    the `claude/wahala-lagos-audio` branch were REJECTED and may never come back;
 *  - the music is the founder's approved Pixabay tracks, listed below by id and in public/audio/music/manifest.json,
 *    plus the founder-approved WAHALA! originals (seven district songs and the Lagos No Dey Sleep menu / boss music
 *    and result stingers, approved 2026-11-25, decision AU4), listed in ORIGINAL_MUSIC and ORIGINAL_STINGS below;
 *  - the voices are the founder's approved Gemini TTS clips (2026-10-24), imported by
 *    tools/audio/voices/import_voices.py and listed in public/audio/voices/recorded.json; the rejected
 *    conductor recordings (conductor_cms_01) may never ship.
 * Adding any other audio means changing this file deliberately.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMusicManifest, pickMatchTrack, playlistFor } from '../../src/audio/playlist';
import { voiceLevel } from '../../src/audio/buses';
import { DEFAULT_AUDIO_PREFS } from '../../src/audio/prefs';
import { parseRecorded, parseVoiceCatalogue, registerLines } from '../../src/audio/pidgin';

const ROOT = join(__dirname, '../..');
const AUDIO = join(ROOT, 'public/audio');
const json = <T>(rel: string): T => JSON.parse(readFileSync(join(AUDIO, rel), 'utf8')) as T;

/** The founder's approved Pixabay tracks (Pixabay Content License): page id -> source page. */
const APPROVED: Record<string, string> = {
  pixabay_569473: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-569473/',
  pixabay_573648: 'https://pixabay.com/music/modern-jazz-afrobeat-instrumental-summer-groove-573648/',
  pixabay_588999: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-588999/',
  pixabay_491433: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-491433/',
  pixabay_439622: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-439622/',
  pixabay_491432: 'https://pixabay.com/music/beats-afrobeat-afro-beat-2-491432/',
  pixabay_496406: 'https://pixabay.com/music/afrobeat-afrobeat-afro-beat-496406/',
  pixabay_406552: 'https://pixabay.com/music/afrobeat-pause-406552/',
  pixabay_540950: 'https://pixabay.com/music/afrobeat-afro-beat-afrobeat-instrumental-540950/',
  pixabay_504898: 'https://pixabay.com/music/electronic-afrobeat-afro-beat-504898/',
  pixabay_601035:
    'Pixabay track 601035 by dmsoundworks (founder download; exact page URL not reachable from the build environment)',
  pixabay_554543:
    'Pixabay track 554543 by rediskasound (founder download; exact page URL not reachable from the build environment)',
  pixabay_455231:
    'Pixabay track 455231 by ruslansikunov (founder download; exact page URL not reachable from the build environment)',
  pixabay_515507:
    'Pixabay track 515507 by solarflex (founder download; exact page URL not reachable from the build environment)',
  pixabay_623364:
    'Pixabay track 623364 by sonican (founder download; exact page URL not reachable from the build environment)',
};
/** The seven district songs (founder-approved 2026-11-25): family -> the City Rumble arena that plays it. */
const DISTRICT_ARENA: Record<string, string> = {
  ojuelegba: 'rumbleOjuelegba',
  oshodi: 'rumbleOshodi',
  mushin: 'rumbleMushin',
  fadeyi: 'rumbleFadeyi',
  ebute: 'rumbleEbuteMetta',
  lagosisland: 'rumbleLagosIsland',
  lekki: 'rumbleLekki',
};
/** Founder-approved WAHALA! original music files (standard in music/, Data Saver in music/lite/). */
const ORIGINAL_MUSIC = [
  ...Object.keys(DISTRICT_ARENA).flatMap((f) => [`dist_${f}.mp3`, `dist_${f}_sd.mp3`]),
  'lnds_menu.mp3',
  'lnds_boss_1.mp3',
  'lnds_boss_2.mp3',
  'lnds_boss_3.mp3',
];
/** The two result stingers (sample slots, public/audio root). */
const ORIGINAL_STINGS: Record<string, string> = {
  win_sting: 'lnds_victory.mp3',
  lose_sting: 'lnds_defeat.mp3',
};
/** Names of the rejected generated tracks; none may ever come back under any form. */
const REJECTED_NAMES =
  /match_loop|menu_loop|match_tension|sting_(win|lose|draw)|crowd_loop|buspark_loop|kokoro/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('rejected generated audio stays disabled', () => {
  it('the only audio files under public/audio are approved Pixabay tracks and the listed, approved voice clips', () => {
    const audioFiles = walk(AUDIO)
      .map((p) => relative(AUDIO, p).split('\\').join('/'))
      // public/audio/candidates/ is the git-ignored local staging area for UNAPPROVED audition files
      // (decision AU1); tests/audio/candidates.test.ts proves nothing there is ever tracked or shipped
      .filter((p) => !p.startsWith('candidates/'))
      .filter((p) => /\.(ogg|mp3|wav|m4a|flac|aac|opus|webm)$/i.test(p));
    const voiceClips = json<{ clips: { file: string }[] }>('voices/recorded.json').clips.map(
      (c) => `voices/recorded/${c.file}`,
    );
    // each approved track may also ship its Data Saver re-encode (docs/MOBILE_PERFORMANCE.md): same track, lower bitrate
    const allowed = new Set([
      ...Object.keys(APPROVED).flatMap((id) => [`music/${id}.mp3`, `music/lite/${id}.mp3`]),
      ...ORIGINAL_MUSIC.flatMap((f) => [`music/${f}`, `music/lite/${f}`]),
      ...Object.values(ORIGINAL_STINGS),
      ...voiceClips,
    ]);
    expect(audioFiles.filter((p) => !allowed.has(p))).toEqual([]);
  });

  it('every Data Saver music file belongs to an approved track, is smaller than its master and is listed in the manifest', () => {
    const raw = json<{ tracks: { id: string; file: string; lite?: string }[] }>('music/manifest.json');
    const liteDir = join(AUDIO, 'music/lite');
    const files = readdirSync(liteDir).sort();
    // the A/B start points of one district song share a file, so compare the distinct files
    const listed = [...new Set(raw.tracks.filter((t) => t.lite).map((t) => t.lite!.replace('lite/', '')))];
    expect(files).toEqual(listed.sort());
    for (const t of raw.tracks.filter((x) => x.lite)) {
      expect(t.lite).toBe(`lite/${t.file}`);
      expect(statSync(join(AUDIO, 'music', t.lite!)).size).toBeLessThan(
        statSync(join(AUDIO, 'music', t.file)).size,
      );
    }
  });

  it('the music manifest lists exactly the fifteen approved Pixabay tracks, each with its source and licence', () => {
    const all = json<{
      tracks: { id: string; file: string; source: string; licence: string; approved: boolean }[];
    }>('music/manifest.json');
    const raw = { ...all, tracks: all.tracks.filter((t) => t.id.startsWith('pixabay_')) };
    expect(raw.tracks.map((t) => t.id).sort()).toEqual(Object.keys(APPROVED).sort());
    for (const t of raw.tracks) {
      expect(t.file).toBe(`${t.id}.mp3`);
      expect(t.source).toBe(APPROVED[t.id]);
      expect(t.licence).toBe('Pixabay Content License');
      expect(t.approved).toBe(true);
    }
    const { manifest, rejected } = parseMusicManifest(all);
    expect(rejected).toEqual([]);
    expect(manifest.tracks.filter((t) => t.id.startsWith('pixabay_'))).toHaveLength(15);
    expect(JSON.stringify(all)).not.toMatch(REJECTED_NAMES);
  });

  it('the other tracks are exactly the founder-approved WAHALA! originals, each flagged approved with a rights note', () => {
    const all = json<{
      tracks: { id: string; file: string; lite?: string; licence: string; approved: boolean; gain: number }[];
    }>('music/manifest.json');
    const originals = all.tracks.filter((t) => !t.id.startsWith('pixabay_'));
    expect([...new Set(originals.map((t) => t.file))].sort()).toEqual([...ORIGINAL_MUSIC].sort());
    for (const t of originals) {
      expect(t.id).toMatch(/^(dist_[a-z]+_(a|b|sd)|lnds_(menu|boss_[123]))$/);
      expect(t.approved).toBe(true);
      expect(t.licence).toMatch(/Founder-approved/);
      expect(t.licence).toMatch(/rights review pending/); // the commercial-release blocker stays visible in the data
      expect(t.lite).toBe(`lite/${t.file}`);
      expect(t.gain).toBe(1); // the masters are already at the -14 LUFS game level
    }
  });

  it('every music file present has its own row (with source page) under "Files present" in LICENSES.md', () => {
    const licences = readFileSync(join(AUDIO, 'LICENSES.md'), 'utf8');
    const section = /### Files present\n([\s\S]*?)(\n## |$)/.exec(licences)?.[1] ?? '';
    expect(section).toContain('| File |');
    const rows = section.split('\n').filter((l) => l.startsWith('| `pixabay_'));
    const present = readdirSync(join(AUDIO, 'music')).filter(
      (n) => n.startsWith('pixabay_') && n.endsWith('.mp3'),
    );
    for (const f of present) {
      const row = rows.find((l) => l.startsWith(`| \`${f}\``));
      expect(row, `${f} needs a row under "Files present"`).toBeDefined();
      expect(row).toContain(APPROVED[f.replace(/\.mp3$/, '')]!);
      expect(row).toContain('Pixabay Content License');
    }
  });

  it('fourteen approved tracks are installed as real MP3 audio; only #7 (pixabay_496406) is missing', () => {
    const present = readdirSync(join(AUDIO, 'music'))
      .filter((n) => n.startsWith('pixabay_') && n.endsWith('.mp3'))
      .sort();
    expect(present).toEqual(
      Object.keys(APPROVED)
        .filter((id) => id !== 'pixabay_496406')
        .map((id) => `${id}.mp3`)
        .sort(),
    );
    for (const f of present) {
      const b = readFileSync(join(AUDIO, 'music', f));
      // an MPEG audio frame sync (or an ID3 tag) at the start: real audio, not an HTML error page
      const mpeg = b[0] === 0xff && (b[1]! & 0xe0) === 0xe0;
      const id3 = b.subarray(0, 3).toString('latin1') === 'ID3';
      expect(mpeg || id3, `${f} is not MP3 audio`).toBe(true);
      expect(b.length, f).toBeGreaterThan(1_000_000);
    }
  });

  it('the only sample slots are the two founder-approved result stingers (all other effects stay synthesised)', () => {
    const slots = json<{ slots: Record<string, { file: string; license: string }> }>('slots.json').slots;
    expect(Object.keys(slots).sort()).toEqual(['lose_sting', 'win_sting']);
    for (const [slot, file] of Object.entries(ORIGINAL_STINGS)) {
      expect(slots[slot]!.file).toBe(file);
      expect(slots[slot]!.license).toMatch(/Founder-approved/);
      const b = readFileSync(join(AUDIO, file));
      expect(
        (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) || b.subarray(0, 3).toString('latin1') === 'ID3',
      ).toBe(true);
    }
  });

  it('the WAHALA! original music files are real MP3 audio, each Data Saver file smaller than its master', () => {
    for (const f of ORIGINAL_MUSIC) {
      for (const dir of ['music', 'music/lite']) {
        const b = readFileSync(join(AUDIO, dir, f));
        const mpeg = b[0] === 0xff && (b[1]! & 0xe0) === 0xe0;
        expect(mpeg || b.subarray(0, 3).toString('latin1') === 'ID3', `${dir}/${f}`).toBe(true);
        expect(b.length, `${dir}/${f}`).toBeGreaterThan(100_000);
      }
      expect(statSync(join(AUDIO, 'music/lite', f)).size).toBeLessThan(
        statSync(join(AUDIO, 'music', f)).size,
      );
    }
  });

  it('the generators of the rejected audio are not in the repository', () => {
    expect(() => statSync(join(ROOT, 'tools/audiogen'))).toThrow();
  });
});

describe('City Rumble stage music (founder assignments 2026-10-25, replaced by the district songs 2026-11-25)', () => {
  /** The earlier licensed track of each V2 stage; it stays as the arena's fallback behind its district song. */
  const STAGE_FALLBACK: Record<string, string> = {
    rumbleOshodi: 'pixabay_601035', // dmsoundworks - Afrobeat Type Beat 2026 (Reach)
    rumbleLagosIsland: 'pixabay_554543', // rediskasound - Afro Beat Groovy Instrumental
    rumbleOjuelegba: 'pixabay_515507', // solarflex - Afrobeat (Afro Beat)
    rumbleLekki: 'pixabay_623364', // sonican - Afrobeat Groove
  };

  it('every City Rumble arena plays its own district song (two start points) and keeps its Pixabay song as fallback', () => {
    const raw = json<{
      playlists: {
        arenas: Record<
          string,
          { tracks: string[]; start: string; signature: string | null; fallback?: string[] }
        >;
      };
    }>('music/manifest.json');
    const { manifest } = parseMusicManifest(raw);
    for (const [family, arena] of Object.entries(DISTRICT_ARENA)) {
      const fb = STAGE_FALLBACK[arena];
      expect(raw.playlists.arenas[arena], arena).toEqual({
        tracks: [`dist_${family}_a`, `dist_${family}_b`],
        start: `dist_${family}_a`,
        signature: null,
        fallback: fb ? [fb] : [],
      });
      expect(manifest.playlists.arenas[arena]?.fallback, arena).toEqual(fb ? [fb] : []);
      if (fb) {
        expect(APPROVED[fb]).toBeDefined();
        expect(readFileSync(join(AUDIO, 'music', `${fb}.mp3`)).length).toBeGreaterThan(1_000_000);
      }
    }
    // seven different songs: no file is shared between two districts
    const files = Object.keys(DISTRICT_ARENA).map(
      (f) => manifest.tracks.find((t) => t.id === `dist_${f}_a`)!.file,
    );
    expect(new Set(files).size).toBe(7);
  });
});

describe('Oshodi Transport Metropolis (replaced the old Oshodi): audio compatibility', () => {
  const raw = json<{
    playlists: {
      default: string[];
      arenas: Record<string, { tracks: string[]; signature: string | null; fallback?: string[] }>;
    };
  }>('music/manifest.json');
  const { manifest } = parseMusicManifest(raw);

  it("keeps the old Oshodi stage's founder-assigned track under the canonical id, and adds no music", () => {
    // the canonical id is unchanged; the Oshodi district song plays there now, the earlier signature track is its fallback
    expect(raw.playlists.arenas.rumbleOshodi!.signature).toBeNull();
    expect(raw.playlists.arenas.rumbleOshodi!.fallback).toEqual(['pixabay_601035']);
    expect(raw.playlists.arenas.rumbleOshodiMetro).toBeUndefined();
    expect(playlistFor(manifest, 'rumbleOshodi')).toEqual(['dist_oshodi_a', 'dist_oshodi_b']);
    const picked = pickMatchTrack(manifest, {
      arenaId: 'rumbleOshodi',
      previous: null,
      isAvailable: () => true,
      rand: () => 0.4,
      firstOnArena: true,
    });
    expect(picked).toBe('dist_oshodi_a');
    // with the district files unavailable the arena falls back to its earlier approved track, never silence
    const fell = pickMatchTrack(manifest, {
      arenaId: 'rumbleOshodi',
      previous: null,
      isAvailable: (id) => id.startsWith('pixabay_'),
      rand: () => 0.4,
      firstOnArena: true,
    });
    expect(fell).toBe('pixabay_601035');
    expect(APPROVED[fell!]).toBeDefined();
  });

  it('keeps its voice zones (bus park and market) and ships no new recording or voice: cues are synthesised', () => {
    const zones = json<{ zones: Record<string, string[]> }>('voices/voices.json').zones;
    expect(zones.bus_park).toContain('rumbleOshodi');
    expect(zones.market).toContain('rumbleOshodi');
    for (const list of Object.values(zones)) expect(list).not.toContain('rumbleOshodiMetro');
    expect(Object.keys(json<{ slots: Record<string, unknown> }>('slots.json').slots).sort()).toEqual([
      'lose_sting',
      'win_sting',
    ]);
    const recorded = json<{ clips: { id: string }[] }>('voices/recorded.json').clips.map((c) => c.id);
    expect(recorded.some((id) => /train|rail|oshodi|metro/i.test(id))).toBe(false);
  });
});

describe('voice clips (founder-approved Gemini TTS, 2026-10-24)', () => {
  const catalogue = parseVoiceCatalogue(json('voices/voices.json'));
  const recorded = parseRecorded(json('voices/recorded.json'));
  const MASTERS = join(ROOT, 'tools/audio/voices/masters');

  it('the catalogue is the founder plan: 47 planned voice lines plus the rejected conductor line, no sound effects', () => {
    expect(catalogue.ignored).toEqual([]);
    const lines = catalogue.catalogue.lines;
    expect(lines.filter((l) => l.status === 'planned')).toHaveLength(47);
    expect(lines.filter((l) => l.status === 'rejected').map((l) => l.id)).toEqual(['conductor_cms_01']);
    expect(
      lines.some((l) => /horn|idle|accel|engine|footsteps|objects|clatter|trolley|traffic_amb/.test(l.id)),
    ).toBe(false);
    expect(Object.keys(catalogue.catalogue.zones).sort()).toEqual(['bus_park', 'market']);
  });

  it('every listed clip is a licensed, playable line with its MP3 present, a WAV master kept, and sane length', () => {
    expect(recorded.ignored).toEqual([]);
    const reg = registerLines(catalogue.catalogue, recorded.clips);
    expect(reg.ignored).toEqual([]);
    expect(reg.lines).toHaveLength(recorded.clips.length);
    const raw = json<{ clips: { id: string; duration: number; peakDb: number }[] }>(
      'voices/recorded.json',
    ).clips;
    for (const c of recorded.clips) {
      expect(c.file).toBe(`${c.id}.mp3`);
      expect(c.license).toMatch(/Gemini/);
      expect(c.license).toMatch(/synthetic/i); // never presented as a recording of a person
      const b = readFileSync(join(AUDIO, 'voices/recorded', c.file));
      const mpeg = b[0] === 0xff && (b[1]! & 0xe0) === 0xe0;
      const id3 = b.subarray(0, 3).toString('latin1') === 'ID3';
      expect(mpeg || id3, `${c.file} is not MP3 audio`).toBe(true);
      expect(b.length, c.file).toBeGreaterThan(2000);
      expect(b.length, c.file).toBeLessThan(80_000);
      expect(statSync(join(MASTERS, `${c.id}.wav`)).isFile()).toBe(true);
      const meta = raw.find((r) => r.id === c.id)!;
      expect(meta.duration).toBeGreaterThan(0.3);
      expect(meta.duration).toBeLessThan(8);
    }
    // masters and clips match one to one
    expect(
      readdirSync(MASTERS)
        .filter((n) => n.endsWith('.wav'))
        .sort(),
    ).toEqual(recorded.clips.map((c) => `${c.id}.wav`).sort());
  });

  it('the founder batches: 19 clips (2026-10-24), 11 more (2026-10-25) and the last 17 (2026-10-28) = all 47', () => {
    expect(recorded.clips.map((c) => c.id).sort()).toEqual(
      [
        // third batch (Sounds.zip, 2026-10-28): the crowd reactions and the haggling / fare exchanges
        'crowd_ahhh_01',
        'crowd_argument_01',
        'crowd_excited_01',
        'crowd_gasp_01',
        'crowd_groan_01',
        'crowd_irritated_01',
        'crowd_laugh_01',
        'crowd_scream_01',
        'market_bargain_exchange_01',
        'market_bargain_exchange_02',
        'market_customer_back_01',
        'market_how_much_01',
        'market_last_price_01',
        'market_make_i_pass_01',
        'market_no_price_01',
        'park_fare_exchange_01',
        'park_route_exchange_02',
        // second batch (WAHALA_VOICES_CURRENT.zip, V2 import)
        'conductor_no_change_01',
        'conductor_shift_01',
        'final_seconds_01',
        'okada_saved_01',
        'okada_saved_02',
        'okada_saved_03',
        'park_driver_move_01',
        'park_going_yaba_01',
        'park_transport_fare_01',
        'victory_01',
        'victory_02',
        // first batch
        'danfo_hit_01',
        'danfo_hit_02',
        'danfo_hit_03',
        'danger_explosion_01',
        'danger_explosion_02',
        'danger_explosion_03',
        'danger_run_01',
        'danger_run_02',
        'danger_run_03',
        'elimination_01',
        'elimination_02',
        'elimination_03',
        'escape_01',
        'escape_02',
        'escape_03',
        'keke_approach_01',
        'keke_approach_02',
        'keke_approach_03',
        'market_come_buy_01',
      ].sort(),
    );
  });

  it('the rejected conductor recordings are nowhere: not listed, not shipped, not kept as masters', () => {
    const everything = [...walk(AUDIO), ...walk(join(ROOT, 'tools/audio/voices'))].map((p) =>
      p.toLowerCase(),
    );
    expect(everything.filter((p) => p.includes('conductor_cms'))).toEqual([]);
    expect(recorded.clips.some((c) => c.id.includes('conductor_cms'))).toBe(false);
  });

  it('at the default mix a voice peak leaves headroom before the master limiter (no clipping, no distortion)', () => {
    const raw = json<{ clips: { id: string; peakDb: number }[] }>('voices/recorded.json').clips;
    const d = DEFAULT_AUDIO_PREFS;
    for (const c of raw) {
      expect(c.peakDb, c.id).toBeLessThanOrEqual(-1);
      // loudest line gain is 1 (urgent); the voice bus follows the ambience slider; then the master slider
      const peak = Math.pow(10, c.peakDb / 20) * 1 * voiceLevel(d.ambience) * d.master;
      expect(20 * Math.log10(peak), c.id).toBeLessThan(-3);
    }
  });
});

describe('documentation', () => {
  it('docs/AUDIO.md records the rejection and how to add real recordings', () => {
    const doc = readFileSync(join(ROOT, 'docs/AUDIO.md'), 'utf8');
    expect(doc).toMatch(/rejected/i);
    expect(doc).toMatch(/recorded\.json/);
    expect(doc).toMatch(/music\/manifest\.json/);
  });
});
