/**
 * The two online City Rumble facts the MAIN bundle may read (docs/ONLINE_INTEGRATION.md section 2): whether the entry is
 * offered, and the endpoint of the build. Tiny and import-free of online code, so the Home screen and the menu can use it
 * without pulling anything online. `flags().rumbleOnline` / `onlineEndpoint` are agent F's fields; they are read through
 * a cast so this compiles with or without them (a flag object without the field simply means "no online").
 */
import { flags } from '../platform';

type RumbleFlags = { rumbleOnline?: boolean; onlineEndpoint?: string | null };

/** True only in a server build opened with `?online`. Home renders the Online entry only when this is true. */
export function rumbleOnlineOffered(): boolean {
  return (flags() as unknown as RumbleFlags).rumbleOnline === true;
}

/** The server endpoint of this build, or null ("Online is not configured in this build"). Never taken from the URL. */
export function rumbleOnlineEndpoint(): string | null {
  const e = (flags() as unknown as RumbleFlags).onlineEndpoint;
  return typeof e === 'string' && e !== '' ? e : null;
}
