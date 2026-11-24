/**
 * The replicated (public) view of an authoritative City Rumble GameState.
 *
 * The server owns the whole GameState. What leaves the server is everything EXCEPT:
 *   - `seed`, `rngState`: knowing them predicts every future random draw (vehicle draws, supply contents ...);
 *   - `hidden`: pickups under soft blocks (bots never see them either: sim/observe.ts);
 *   - `config`: ~100 KB that is a pure function of (arena, settings) - the client rebuilds it with the same
 *     `createGame` it already ships (see client/replica.ts), so it is never sent.
 *
 * Everything else (tiles, players, generators, flames, blasts, vehicles, stage hazards, match clock ...) is what the
 * real renderer and HUD read. It is the same data the sim produced: the client never re-derives a rule from it.
 */
import type { GameState } from '../sim';

/** Keys of GameState never sent to any client. */
export const SECRET_KEYS = ['seed', 'rngState', 'hidden', 'config'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export type PublicState = Omit<GameState, SecretKey>;

/** Top-level keys that are replicated, in a fixed order (the delta encoder walks them). */
export type PublicKey = keyof PublicState;

export function publicState(state: GameState): PublicState {
  const { seed: _s, rngState: _r, hidden: _h, config: _c, ...rest } = state;
  void _s;
  void _r;
  void _h;
  void _c;
  return rest;
}
