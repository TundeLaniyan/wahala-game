import type { IncomingMessage } from 'node:http';
import type { Principal } from '../identity/types';
import type { Rate } from './rateLimit';
import { RATES } from './rateLimit';

export type AuthKind = 'none' | 'player' | 'service' | 'admin';

export interface RouteContext {
  req: IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Raw body text (already size-limited). Empty for GET. */
  raw: string;
  /** Parses `raw` as JSON (throws `bad_request`). A missing body is `{}`. */
  json(): unknown;
  ip: string;
  requestId: string;
  now: Date;
  /** Set for `auth: 'player'` routes. */
  principal: Principal;
  header(name: string): string | undefined;
}

export interface RouteResult {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** `/v1/friends/:id`. */
  path: string;
  auth: AuthKind;
  /** Rate class (per player, or per address when anonymous). */
  rate: keyof typeof RATES | null;
  /** Largest body, bytes (default 16 KiB). */
  maxBytes?: number;
  /** Short description for the generated route table and the OpenAPI consistency test. */
  summary: string;
  handler(ctx: RouteContext): Promise<RouteResult | undefined>;
}

export const rateOf = (c: keyof typeof RATES): Rate => RATES[c];

interface Compiled {
  def: RouteDef;
  re: RegExp;
  names: string[];
}

export class Router {
  private readonly routes: Compiled[] = [];

  add(def: RouteDef): void {
    const names: string[] = [];
    const src = def.path
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          names.push(seg.slice(1));
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({ def, re: new RegExp(`^${src}$`), names });
  }

  addAll(defs: readonly RouteDef[]): void {
    for (const d of defs) this.add(d);
  }

  list(): readonly RouteDef[] {
    return this.routes.map((r) => r.def);
  }

  /** `match` is null for an unknown path; `methodNotAllowed` lists the methods that DO exist for it. */
  find(
    method: string,
    path: string,
  ): { def: RouteDef; params: Record<string, string> } | { methodNotAllowed: string[] } | null {
    const allowed: string[] = [];
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      if (r.def.method !== method) {
        allowed.push(r.def.method);
        continue;
      }
      const params: Record<string, string> = {};
      r.names.forEach((n, i) => {
        try {
          params[n] = decodeURIComponent(m[i + 1]!);
        } catch {
          params[n] = '';
        }
      });
      return { def: r.def, params };
    }
    return allowed.length > 0 ? { methodNotAllowed: allowed } : null;
  }
}
