/**
 * Shared building blocks of the Academy lessons. Boards are Danfo Bus Park emptied of crates unless a
 * lesson says otherwise: 15 x 11 tiles, concrete pillars on every odd/odd tile (so every even row and
 * every even column is an open lane), stage hazards off. Coordinates are (x, y) tiles from the top-left;
 * the human always starts in the bottom-left corner (0, 10), the lower-left spawn.
 */
import { Tile } from '../../sim';
import type { CharacterId, DeepPartial, GameConfig, GameState, TilePos } from '../../sim';
import { when } from '../practice';
import { PRACTICE_CONFIG, scenario } from '../setup';
import type { Actor, ScenarioOptions } from '../setup';
import type { Detector, PracticeContext } from '../types';

export const HERO: Actor = { name: 'YOU', characterId: 'streetBaller' };

/** A training dummy (passive: it never acts unless a lesson scripts it). */
export const dummy = (
  at: [number, number],
  name = 'DUMMY',
  characterId: CharacterId = 'lekkiBoy',
): Actor => ({
  name,
  characterId,
  at,
  facing: 'left',
});

/** A dummy of a different character than the human's, so the two are easy to tell apart. */
export const rivalOf = (c: CharacterId): CharacterId => (c === 'lekkiBoy' ? 'streetBaller' : 'lekkiBoy');

export interface BoardOptions {
  others?: Actor[];
  settings?: ScenarioOptions['settings'];
  config?: DeepPartial<GameConfig>;
  at?: [number, number];
}

/** A practice board: the human in the bottom-left corner, plus any dummies; then the lesson fills it. */
export function practiceBoard(
  character: CharacterId,
  fill: (s: GameState) => void = () => undefined,
  opts: BoardOptions = {},
): GameState {
  const s = scenario({
    actors: [
      { name: 'YOU', characterId: character, at: opts.at ?? [0, 10], facing: 'right' },
      ...(opts.others ?? []),
    ],
    config: { ...PRACTICE_CONFIG, ...opts.config },
    settings: opts.settings,
  });
  fill(s);
  return s;
}

/** A demo board: the demo hero (Street Baller) wherever the lesson puts them. */
export function demoBoard(
  at: [number, number],
  fill: (s: GameState) => void = () => undefined,
  opts: Omit<BoardOptions, 'at'> = {},
): GameState {
  const s = scenario({
    actors: [{ ...HERO, at, facing: 'right' }, ...(opts.others ?? [])],
    config: opts.config,
    settings: opts.settings,
  });
  fill(s);
  return s;
}

export const markAt =
  (...tiles: [number, number][]) =>
  (): TilePos[] =>
    tiles.map(([x, y]) => ({ x, y }));

const me = (ctx: PracticeContext) => ctx.state.players[ctx.localId]!;

/**
 * At the moment one of the human's generators explodes the human is standing, in the generator's row or
 * column within its reach, with a pillar (`'pillar'`) or a crate that the blast broke (`'crate'`) in between:
 * the obstacle sheltered them.
 */
export function shelteredBy(kind: 'pillar' | 'crate'): Detector {
  return when((ctx) => {
    const p = me(ctx);
    if (!p.alive) return false;
    return ctx.events.some((e) => {
      if (e.type !== 'generatorExploded' || e.ownerId !== ctx.localId) return false;
      const sameCol = e.x === p.x && e.y !== p.y;
      const sameRow = e.y === p.y && e.x !== p.x;
      if (!sameCol && !sameRow) return false;
      const dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
      if (dist > e.range) return false;
      const between: TilePos[] = [];
      for (let k = 1; k < dist; k++)
        between.push(
          sameRow
            ? { x: e.x + Math.sign(p.x - e.x) * k, y: e.y }
            : { x: e.x, y: e.y + Math.sign(p.y - e.y) * k },
        );
      return kind === 'pillar'
        ? between.some((t) => ctx.state.tiles[t.y * ctx.state.width + t.x] === Tile.Hard)
        : between.some((t) =>
            ctx.events.some(
              (b) => b.type === 'blockDestroyed' && b.by === 'flame' && b.x === t.x && b.y === t.y,
            ),
          );
    });
  });
}

/** The human is on a tile next to player `id` (up, down, left or right). */
export const besides = (ctx: PracticeContext, id: number): boolean => {
  const p = me(ctx);
  const o = ctx.state.players[id];
  return !!o && o.alive && p.alive && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) === 1;
};
