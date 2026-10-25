/**
 * Layout measurements for the City Rumble stages (used by tests/rumble-stages.test.ts and
 * scripts/rumble-stages.ts). Crates are ignored: only concrete ('#') blocks.
 */
export interface LayoutStats {
  /** Open tiles (floor + road) as a % of the board. */
  openPct: number;
  /** Road tiles (crate-free lanes / squares) as a % of the board. */
  roadPct: number;
  /** Mean length of the maximal straight runs of open tiles (rows and columns, length >= 2). */
  avgCorridor: number;
  longestCorridor: number;
  /** Open tiles whose loss would split the board (articulation points of the open-tile graph). */
  chokepoints: number;
  /** Open tiles with exactly two open neighbours in a straight line (corridor tiles), as a % of open tiles. */
  corridorPct: number;
}

export function layoutStats(rows: readonly string[]): LayoutStats {
  const H = rows.length;
  const W = rows[0]!.length;
  const open = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && rows[y]![x] !== '#';
  let nOpen = 0;
  let nRoad = 0;
  let nCorr = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!open(x, y)) continue;
      nOpen++;
      if (rows[y]![x] === '=') nRoad++;
      const h = open(x - 1, y) && open(x + 1, y);
      const v = open(x, y - 1) && open(x, y + 1);
      const n = [open(x - 1, y), open(x + 1, y), open(x, y - 1), open(x, y + 1)].filter(Boolean).length;
      if (n === 2 && (h || v)) nCorr++;
    }
  const runs: number[] = [];
  for (let y = 0; y < H; y++) {
    let r = 0;
    for (let x = 0; x <= W; x++) {
      if (x < W && open(x, y)) r++;
      else {
        if (r >= 2) runs.push(r);
        r = 0;
      }
    }
  }
  for (let x = 0; x < W; x++) {
    let r = 0;
    for (let y = 0; y <= H; y++) {
      if (y < H && open(x, y)) r++;
      else {
        if (r >= 2) runs.push(r);
        r = 0;
      }
    }
  }
  return {
    openPct: (100 * nOpen) / (W * H),
    roadPct: (100 * nRoad) / (W * H),
    avgCorridor: runs.reduce((a, b) => a + b, 0) / Math.max(1, runs.length),
    longestCorridor: Math.max(0, ...runs),
    chokepoints: articulationPoints(rows),
    corridorPct: (100 * nCorr) / Math.max(1, nOpen),
  };
}

/** Number of articulation points of the 4-connected open-tile graph (iterative Tarjan). */
export function articulationPoints(rows: readonly string[]): number {
  const H = rows.length;
  const W = rows[0]!.length;
  const N = W * H;
  const isOpen = (i: number): boolean => rows[Math.floor(i / W)]![i % W] !== '#';
  const disc = new Int32Array(N).fill(-1);
  const low = new Int32Array(N);
  const parent = new Int32Array(N).fill(-1);
  const cut = new Uint8Array(N);
  const nbrs = (i: number): number[] => {
    const x = i % W;
    const y = Math.floor(i / W);
    const out: number[] = [];
    if (x > 0 && isOpen(i - 1)) out.push(i - 1);
    if (x < W - 1 && isOpen(i + 1)) out.push(i + 1);
    if (y > 0 && isOpen(i - W)) out.push(i - W);
    if (y < H - 1 && isOpen(i + W)) out.push(i + W);
    return out;
  };
  let time = 0;
  for (let root = 0; root < N; root++) {
    if (!isOpen(root) || disc[root] !== -1) continue;
    let rootChildren = 0;
    const stack: { v: number; it: number; ns: number[] }[] = [{ v: root, it: 0, ns: nbrs(root) }];
    disc[root] = low[root] = time++;
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      if (top.it < top.ns.length) {
        const w = top.ns[top.it++]!;
        if (disc[w] === -1) {
          parent[w] = top.v;
          if (top.v === root) rootChildren++;
          disc[w] = low[w] = time++;
          stack.push({ v: w, it: 0, ns: nbrs(w) });
        } else if (w !== parent[top.v]) low[top.v] = Math.min(low[top.v]!, disc[w]!);
      } else {
        stack.pop();
        const p = parent[top.v]!;
        if (p >= 0) {
          low[p] = Math.min(low[p]!, low[top.v]!);
          if (p !== root && low[top.v]! >= disc[p]!) cut[p] = 1;
        }
      }
    }
    if (rootChildren > 1) cut[root] = 1;
  }
  return cut.reduce((a, b) => a + b, 0);
}
