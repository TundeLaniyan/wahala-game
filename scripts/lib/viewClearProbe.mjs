// In-page probe shared by the view-clear scripts (docs/DECISIONS.md VF-B): measures, from the real camera, what the
// scenery hides. Harness only: it ray-casts every triangle, the game never does.
/* eslint-disable */
export async function installProbe(page) {
  await page.evaluate(() => {
    const w = window;
    const gr = w.__WAHALA__.renderer();
    const smooth = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const slab = (a, b, box, pad) => {
      const lo = [box.minX - pad, box.minY, box.minZ - pad];
      const hi = [box.maxX + pad, box.maxY + pad, box.maxZ + pad];
      const o = [a.x, a.y, a.z];
      const d = [b.x - a.x, b.y - a.y, b.z - a.z];
      let t0 = 0;
      let t1 = 0.98;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) {
          if (o[i] < lo[i] || o[i] > hi[i]) return false;
          continue;
        }
        let ta = (lo[i] - o[i]) / d[i];
        let tb = (hi[i] - o[i]) / d[i];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) return false;
      }
      return true;
    };
    // Moller-Trumbore against every triangle of the scenery meshes (harness only; the game never does this).
    const rayTri = (o, d, a, b, c) => {
      const e1x = b[0] - a[0],
        e1y = b[1] - a[1],
        e1z = b[2] - a[2];
      const e2x = c[0] - a[0],
        e2y = c[1] - a[1],
        e2z = c[2] - a[2];
      const px = d[1] * e2z - d[2] * e2y,
        py = d[2] * e2x - d[0] * e2z,
        pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) return -1;
      const inv = 1 / det;
      const tx = o[0] - a[0],
        ty = o[1] - a[1],
        tz = o[2] - a[2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) return -1;
      const qx = ty * e1z - tz * e1y,
        qy = tz * e1x - tx * e1z,
        qz = tx * e1y - ty * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (v < 0 || u + v > 1) return -1;
      return (e2x * qx + e2y * qy + e2z * qz) * inv;
    };
    const collect = () => {
      const out = [];
      const take = (root, kind) =>
        root.traverse((o) => {
          if (!o.isMesh || o.isSkinnedMesh || !o.visible) return;
          const g = o.geometry;
          if (!g.boundingBox) g.computeBoundingBox();
          out.push({ mesh: o, kind: o.parent && o.parent.name === 'boardCover' ? 'cover' : kind });
        });
      take(gr.arena.group, 'arena');
      take(gr.backdrop.root, 'backdrop');
      return out;
    };
    const m4 = (e) => e.slice();
    // first hit distance (and the dissolve at that hit) of the ray o + t d, 0 < t < tmax, over the scenery meshes
    const cast = (items, o, d, tmax) => {
      let best = null;
      const hitsOf = (it, local, inst) => {
        const g = it.mesh.geometry;
        const pos = g.attributes.position;
        const idx = g.index;
        const n = idx ? idx.count : pos.count;
        const A = [0, 0, 0],
          B = [0, 0, 0],
          C = [0, 0, 0];
        for (let i = 0; i < n; i += 3) {
          const ia = idx ? idx.getX(i) : i,
            ib = idx ? idx.getX(i + 1) : i + 1,
            ic = idx ? idx.getX(i + 2) : i + 2;
          A[0] = pos.getX(ia);
          A[1] = pos.getY(ia);
          A[2] = pos.getZ(ia);
          B[0] = pos.getX(ib);
          B[1] = pos.getY(ib);
          B[2] = pos.getZ(ib);
          C[0] = pos.getX(ic);
          C[1] = pos.getY(ic);
          C[2] = pos.getZ(ic);
          const t = rayTri(local.o, local.d, A, B, C);
          if (t > 0.02 && t < tmax && (!best || t < best.t)) {
            const ah = g.attributes.aHide;
            const h = ah ? (inst >= 0 ? ah.getX(inst) : ah.getX(ia)) : 0;
            const y = o[1] + d[1] * t;
            best = { t, kind: it.kind, hide: h, y, at: [o[0] + d[0] * t, y, o[2] + d[2] * t] };
          }
        }
      };
      for (const it of items) {
        const mesh = it.mesh;
        mesh.updateWorldMatrix(true, false);
        const loc = (matrix) => {
          const inv = matrix.clone().invert();
          const o2 = [o[0], o[1], o[2]];
          const e = inv.elements;
          const tp = (v, wgt) => [
            e[0] * v[0] + e[4] * v[1] + e[8] * v[2] + e[12] * wgt,
            e[1] * v[0] + e[5] * v[1] + e[9] * v[2] + e[13] * wgt,
            e[2] * v[0] + e[6] * v[1] + e[10] * v[2] + e[14] * wgt,
          ];
          return { o: tp(o2, 1), d: tp(d, 0) };
        };
        if (mesh.isInstancedMesh) {
          const im = new mesh.matrixWorld.constructor();
          const inst = new mesh.matrixWorld.constructor();
          for (let k = 0; k < mesh.count; k++) {
            mesh.getMatrixAt(k, inst);
            im.multiplyMatrices(mesh.matrixWorld, inst);
            const bb = mesh.geometry.boundingBox;
            // cheap reject: world-space instance centre vs the ray
            const c = [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2];
            const e = im.elements;
            const cw = [
              e[0] * c[0] + e[4] * c[1] + e[8] * c[2] + e[12],
              e[1] * c[0] + e[5] * c[1] + e[9] * c[2] + e[13],
              e[2] * c[0] + e[6] * c[1] + e[10] * c[2] + e[14],
            ];
            const rad =
              Math.hypot(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) *
              0.6 *
              Math.max(
                Math.hypot(e[0], e[1], e[2]),
                Math.hypot(e[4], e[5], e[6]),
                Math.hypot(e[8], e[9], e[10]),
              );
            const rx = cw[0] - o[0],
              ry = cw[1] - o[1],
              rz = cw[2] - o[2];
            const dl = Math.hypot(d[0], d[1], d[2]);
            const tproj = (rx * d[0] + ry * d[1] + rz * d[2]) / (dl * dl);
            const px = rx - d[0] * tproj,
              py = ry - d[1] * tproj,
              pz = rz - d[2] * tproj;
            if (Math.hypot(px, py, pz) > rad) continue;
            hitsOf(it, loc(im), k);
          }
        } else {
          // world-space AABB reject
          const bb = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
          if (bb.max.y < 0.3) continue;
          if (
            !slab(
              { x: o[0], y: o[1], z: o[2] },
              { x: o[0] + d[0] * tmax, y: o[1] + d[1] * tmax, z: o[2] + d[2] * tmax },
              {
                minX: bb.min.x,
                minY: bb.min.y,
                minZ: bb.min.z,
                maxX: bb.max.x,
                maxY: bb.max.y,
                maxZ: bb.max.z,
              },
              0.05,
            )
          )
            continue;
          hitsOf(it, loc(mesh.matrixWorld), -1);
        }
      }
      return best;
    };
    const readFrame = () => {
      const rd = gr.renderer;
      const gl = rd.getContext();
      const bw = gl.drawingBufferWidth;
      const bh = gl.drawingBufferHeight;
      const buf = new Uint8Array(bw * bh * 4);
      rd.render(gr.scene, gr.rig.camera);
      gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return { buf, bw, bh };
    };
    w.__vc = {
      measure() {
        const st = w.__WAHALA__.getState();
        const p = st.players[0];
        const lay = gr.layout;
        const cam = gr.rig.camera;
        cam.updateMatrixWorld(true);
        const eye = cam.position;
        const E = [eye.x, eye.y, eye.z];
        const fx = lay.wx(p.x);
        const fz = lay.wz(p.y);
        const items = collect();
        const dirTo = (t) => [t[0] - E[0], t[1] - E[1], t[2] - E[2]];
        const samples = [];
        const kinds = {};
        let fighter = 0;
        for (const h of [0.85, 1.4]) {
          const tpt = [fx, h, fz];
          const hit = cast(items, E, dirTo(tpt), 0.985);
          const cov = hit ? 1 - hit.hide * smooth(0.28, 0.7, hit.y) : 0;
          fighter += cov / 2;
          samples.push({ a: E, b: tpt });
          if (hit && cov > 0.3)
            kinds[`${hit.kind}@${hit.at.map((v) => v.toFixed(1))}`] =
              (kinds[`${hit.kind}@${hit.at.map((v) => v.toFixed(1))}`] ?? 0) + 1;
        }
        // the floor disc
        let ring = 0;
        let rn = 0;
        for (const r of [0.8, 1.6, 2.5])
          for (let k = 0; k < 12; k++) {
            const ang = (k / 12) * Math.PI * 2;
            const tx = p.x + Math.cos(ang) * r;
            const ty = p.y + Math.sin(ang) * r;
            const ix = Math.round(tx);
            const iy = Math.round(ty);
            if (ix < 0 || iy < 0 || ix >= st.width || iy >= st.height) continue;
            if (st.tiles[iy * st.width + ix] !== 0) continue; // only walkable floor counts
            const tpt = [lay.wx(tx), 0.15, lay.wz(ty)];
            const hit = cast(items, E, dirTo(tpt), 0.985);
            rn++;
            const cov = hit ? 1 - hit.hide * smooth(0.28, 0.7, hit.y) : 0;
            ring += cov;
            samples.push({ a: E, b: tpt });
            if (hit && cov > 0.3)
              kinds[`${hit.kind}@${hit.at.map((v) => v.toFixed(1))}`] =
                (kinds[`${hit.kind}@${hit.at.map((v) => v.toFixed(1))}`] ?? 0) + 1;
          }
        // faded objects and whether any sample ray crosses them
        const arena = gr.arena;
        const faded = [];
        let unrelated = 0;
        for (const [tile, v] of arena.hideOf) {
          if (v < 0.1) continue;
          const tx = tile % st.width;
          const ty = Math.floor(tile / st.width);
          let box = null;
          const cb = arena.cover ? arena.cover.bounds.find((b) => b.tile === tile) : null;
          if (cb) box = cb;
          else {
            const cx = lay.wx(tx);
            const cz = lay.wz(ty);
            box = { minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - 0.5, maxZ: cz + 0.5, minY: 0, maxY: 1.6 };
          }
          const crossed = samples.some((s) =>
            slab({ x: s.a[0], y: s.a[1], z: s.a[2] }, { x: s.b[0], y: s.b[1], z: s.b[2] }, box, 0.05),
          );
          const cp = new cam.position.constructor(
            (box.minX + box.maxX) / 2,
            box.maxY / 2,
            (box.minZ + box.maxZ) / 2,
          ).project(cam);
          const onScreen = cp.z < 1 && Math.abs(cp.x) < 1.15 && Math.abs(cp.y) < 1.15;
          const others = [];
          for (const q of st.players) if (q.alive && q !== p) others.push([lay.wx(q.x), 0.85, lay.wz(q.y)]);
          for (const g of st.generators) others.push([lay.wx(g.x), 0.5, lay.wz(g.y)]);
          for (const k of st.pickups) others.push([lay.wx(k.x), 0.4, lay.wz(k.y)]);
          const forOthers = others.some((b) =>
            slab({ x: E[0], y: E[1], z: E[2] }, { x: b[0], y: b[1], z: b[2] }, box, 0.05),
          );
          faded.push({ tile, hide: +v.toFixed(2), crossed, forOthers, onScreen });
          // the old rule (kept as it was) dissolves the obstacle south of every live player, generator and pickup
          const reach = arena.cover ? arena.cover.maxReach : 1;
          const south = [...st.players.filter((q) => q.alive), ...st.generators, ...st.pickups].some(
            (o) => Math.round(o.x) === tx && ty > Math.round(o.y) && ty <= Math.round(o.y) + reach,
          );
          if (!crossed && !forOthers && !south && onScreen && v >= 0.6) unrelated++;
        }
        // pixels: the fighter alone vs the frame
        const A = readFrame();
        const vis = [];
        const savedBg = gr.scene.background;
        const keep = new Set([gr.players.group]);
        const prev = [];
        for (const c of gr.scene.children) {
          prev.push([c, c.visible]);
          if (!keep.has(c)) c.visible = false;
        }
        const B = readFrame();
        for (const [c, v] of prev) c.visible = v;
        gr.scene.background = savedBg;
        const px = (b, i) => [b.buf[i], b.buf[i + 1], b.buf[i + 2]];
        const proj = (x, y, z) => {
          const v = new cam.position.constructor(x, y, z).project(cam);
          return { x: ((v.x + 1) / 2) * B.bw, y: ((v.y + 1) / 2) * B.bh };
        };
        const f0 = proj(fx, 0, fz);
        const f1 = proj(fx, 1.7, fz);
        const fr = proj(fx + 0.4, 0.9, fz);
        const hw = Math.abs(fr.x - proj(fx, 0.9, fz).x);
        const box = {
          x0: f0.x - hw,
          x1: f0.x + hw,
          y0: Math.min(f0.y, f1.y) - 2,
          y1: Math.max(f0.y, f1.y) + 2,
        };
        const inBox = (i) => {
          const j = i / 4;
          const x = j % B.bw;
          const y = Math.floor(j / B.bw);
          return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
        };
        const bg = px(B, 0);
        let n = 0;
        let seen = 0;
        let minY = 1e9;
        let maxY = -1;
        for (let i = 0; i < B.buf.length; i += 4) {
          if (!inBox(i)) continue;
          const d =
            Math.abs(B.buf[i] - bg[0]) + Math.abs(B.buf[i + 1] - bg[1]) + Math.abs(B.buf[i + 2] - bg[2]);
          if (d > 30) {
            const y = Math.floor(i / 4 / B.bw);
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        const headCut = maxY - (maxY - minY) * 0.4; // GL rows count from the bottom: the head is the high rows
        let hn = 0;
        let hseen = 0;
        for (let i = 0; i < B.buf.length; i += 4) {
          if (!inBox(i)) continue;
          const d =
            Math.abs(B.buf[i] - bg[0]) + Math.abs(B.buf[i + 1] - bg[1]) + Math.abs(B.buf[i + 2] - bg[2]);
          if (d <= 30) continue;
          const ok =
            Math.abs(A.buf[i] - B.buf[i]) +
              Math.abs(A.buf[i + 1] - B.buf[i + 1]) +
              Math.abs(A.buf[i + 2] - B.buf[i + 2]) <=
            70;
          n++;
          if (ok) seen++;
          const y = Math.floor(i / 4 / B.bw);
          if (y >= headCut) {
            hn++;
            if (ok) hseen++;
          }
        }
        void vis;
        return {
          rayFighter: +fighter.toFixed(2),
          rayRing: +(rn ? ring / rn : 0).toFixed(2),
          ringN: rn,
          pixVisible: n ? +(seen / n).toFixed(2) : null,
          headVisible: hn ? +(hseen / hn).toFixed(2) : null,
          fighterPx: n,
          faded: faded.length,
          unrelated,
          fadedList: faded,
          blockers: kinds,
          cam: [+E[0].toFixed(1), +E[1].toFixed(1), +E[2].toFixed(1)],
          fighter: [+fx.toFixed(1), +fz.toFixed(1)],
          quality: gr.profile ? gr.profile.name : null,
          viewClear: gr.profile ? gr.profile.viewClear : null,
        };
      },

      // fighter (torso, head) and floor-disc coverage only: cheap enough to run every frame while walking
      quick() {
        const st = w.__WAHALA__.getState();
        const p = st.players[0];
        const lay = gr.layout;
        const cam = gr.rig.camera;
        cam.updateMatrixWorld(true);
        const E = [cam.position.x, cam.position.y, cam.position.z];
        const k =
          p.stepRemaining <= 0 || p.stepTotal <= 0
            ? 1
            : Math.min(1, Math.max(0, 1 - p.stepRemaining / p.stepTotal));
        const gx = p.stepFromX + (p.x - p.stepFromX) * k;
        const gy = p.stepFromY + (p.y - p.stepFromY) * k;
        const fx = lay.wx(gx);
        const fz = lay.wz(gy);
        const items = collect();
        let fighter = 0;
        for (const h of [0.85, 1.4]) {
          const tpt = [fx, h, fz];
          const hit = cast(items, E, [tpt[0] - E[0], tpt[1] - E[1], tpt[2] - E[2]], 0.985);
          fighter += (hit ? 1 - hit.hide * smooth(0.28, 0.7, hit.y) : 0) / 2;
        }
        let ring = 0;
        let rn = 0;
        for (const r of [0.9, 1.7, 2.5])
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            const tx = gx + Math.cos(ang) * r;
            const ty = gy + Math.sin(ang) * r;
            const ix = Math.round(tx);
            const iy = Math.round(ty);
            if (ix < 0 || iy < 0 || ix >= st.width || iy >= st.height || st.tiles[iy * st.width + ix] !== 0)
              continue;
            const tpt = [lay.wx(tx), 0.15, lay.wz(ty)];
            const hit = cast(items, E, [tpt[0] - E[0], tpt[1] - E[1], tpt[2] - E[2]], 0.985);
            rn++;
            ring += hit ? 1 - hit.hide * smooth(0.28, 0.7, hit.y) : 0;
          }
        return {
          fighter: +fighter.toFixed(2),
          ring: +(rn ? ring / rn : 0).toFixed(2),
          vc: w.__WAHALA__.viewClear?.() ?? null,
        };
      },
      // waits for n drawn frames: the fade is eased per frame, so a slow software renderer needs frames, not seconds
      frames(n) {
        return new Promise((res) => {
          let k = 0;
          const f = () => (++k >= n ? res(k) : requestAnimationFrame(f));
          requestAnimationFrame(f);
        });
      },
      place(x, y) {
        const p = w.__WAHALA__.getState().players[0];
        p.x = p.stepFromX = x;
        p.y = p.stepFromY = y;
        p.stepRemaining = 0;
        gr.debugInspect(null);
        gr.cutCamera();
      },
    };
  });
}
