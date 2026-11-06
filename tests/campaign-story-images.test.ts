/**
 * The story-panel image data (docs/STORY_VISUALS.md): every referenced file exists and is a 960 x 540 WebP inside the
 * size budget, every picture has real alt text, the keys cover the screens that need a panel, and every story card
 * maps to a key. No picture shows or names the unseen broker.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN, DISTRICT_ORDER, cardsFrom } from '../src/campaign';
import {
  STORY_IMAGES,
  STORY_IMAGE_BUDGET,
  sectionImageKeys,
  storyImageDef,
  storyImageKeyForCard,
} from '../src/campaign/content/storyImages';

const DIR = join(__dirname, '..', 'src', 'assets', 'story');
const defs = Object.entries(STORY_IMAGES);

/** Width and height of a WebP file (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

const BOSS_IDS = DISTRICT_ORDER.map((d) => CAMPAIGN.districts[d].boss?.id).filter((id): id is string => !!id);

describe('story image data', () => {
  it('ships images', () => expect(defs.length).toBeGreaterThanOrEqual(19));

  it('every referenced file exists and is a 960 x 540 WebP', () => {
    for (const [key, d] of defs) {
      const path = join(DIR, d.file);
      expect(existsSync(path), `${key}: ${d.file} is missing`).toBe(true);
      const size = webpSize(readFileSync(path));
      expect(size, `${key}: ${d.file} is not a WebP`).not.toBeNull();
      expect(size, `${key}: size`).toEqual({ w: STORY_IMAGE_BUDGET.width, h: STORY_IMAGE_BUDGET.height });
    }
  });

  it('stays inside the size budget (each hero, and the whole set)', () => {
    let total = 0;
    for (const [key, d] of defs) {
      const bytes = statSync(join(DIR, d.file)).size;
      total += bytes;
      expect(bytes, `${key} is ${Math.round(bytes / 1024)} KB`).toBeLessThanOrEqual(
        STORY_IMAGE_BUDGET.maxBytes,
      );
    }
    expect(total, `${Math.round(total / 1024)} KB in all`).toBeLessThanOrEqual(
      STORY_IMAGE_BUDGET.maxTotalBytes,
    );
  });

  it('every picture has real alt text and a usable focal point; no file is used twice', () => {
    const files = new Set<string>();
    for (const [key, d] of defs) {
      expect(d.alt.trim().length, `${key}: alt text`).toBeGreaterThanOrEqual(30);
      expect(d.alt, `${key}: alt text describes the scene, not "image of"`).not.toMatch(
        /^(an? )?(image|picture|photo) of/i,
      );
      expect(d.position, `${key}: object-position`).toMatch(/^\d{1,3}% \d{1,3}%$/);
      if (d.caption !== undefined) expect(d.caption.length, `${key}: caption`).toBeLessThanOrEqual(80);
      expect(files.has(d.file), `${key}: ${d.file} is used by two keys`).toBe(false);
      files.add(d.file);
    }
  });

  it('has no orphan files: every file in src/assets/story is referenced', () => {
    const used = new Set(defs.map(([, d]) => d.file));
    for (const f of readdirSync(DIR)) expect(used.has(f), `${f} is not in STORY_IMAGES`).toBe(true);
  });

  it('covers the required screens: prologue, finale, ending, seven briefings, six boss intros, sections', () => {
    const need = [
      'prologue',
      'finale',
      'ending',
      ...DISTRICT_ORDER.map((d) => `district.${d}.briefing`),
      ...BOSS_IDS.map((b) => `boss.${b}.intro`),
      'section.oshodi.approach',
      'raid.warehouseDispatchDepot',
    ];
    expect(DISTRICT_ORDER).toHaveLength(7);
    expect(BOSS_IDS).toHaveLength(6);
    for (const key of need) expect(storyImageDef(key), `no image for ${key}`).not.toBeNull();
    // at least one field section (Oshodi approach) and one raid section (the rail-yard raid)
    expect(storyImageDef('section.ebuteMetta.railYard')).not.toBeNull();
  });

  it('maps every story card to its key, and each mapped key has a picture', () => {
    for (const card of cardsFrom()) {
      const key = storyImageKeyForCard(card.id);
      if (card.kind === 'defeat') {
        expect(key, card.id).toBeNull();
        continue;
      }
      expect(key, `${card.id} has no image key`).not.toBeNull();
      expect(storyImageDef(key!), `${card.id} -> ${key}`).not.toBeNull();
    }
    expect(storyImageKeyForCard('briefing.oshodi')).toBe('district.oshodi.briefing');
    expect(storyImageKeyForCard('intro.mushin')).toBe('boss.madamRonke.intro');
    expect(storyImageKeyForCard('section.oshodi.approach')).toBe('section.oshodi.approach');
    expect(storyImageKeyForCard('result.oshodi.won')).toBeNull();
    expect(storyImageKeyForCard('nonsense')).toBeNull();
    expect(storyImageKeyForCard('intro.nowhere')).toBeNull();
  });

  it('section rows ask for their own panel, then one per raid door', () => {
    expect(sectionImageKeys('oshodi.approach')).toEqual([
      'section.oshodi.approach',
      'raid.warehouseDispatchDepot',
    ]);
    expect(sectionImageKeys('oshodi.railEdge')[0]).toBe('section.oshodi.railEdge');
    expect(sectionImageKeys('nope')).toEqual(['section.nope']);
  });

  it('unknown keys have no picture (and prototype names are not keys)', () => {
    expect(storyImageDef('nope')).toBeNull();
    expect(storyImageDef('constructor')).toBeNull();
    expect(storyImageDef('__proto__')).toBeNull();
  });

  it('never shows or names the unseen broker, and never puts a real-person marker in alt text or captions', () => {
    for (const [key, d] of defs) {
      const text = `${d.alt} ${d.caption ?? ''}`.toLowerCase();
      expect(text, key).not.toMatch(/chairman|baba alaga|portrait of|photograph|silhouette of the/);
    }
  });
});
