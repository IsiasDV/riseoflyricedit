// Static triangle-soup collider: uniform XZ grid (CSR typed arrays) plus
// sphere push-out and vertical ground queries. Pure math (no THREE, no DOM).
export const WALKABLE_NY = 0.6;

export class CollisionWorld {
  // positions: Float32Array of world-space triangles (9 floats each).
  constructor(positions, cellSize = 4) {
    this.pos = positions;
    this.triCount = Math.floor(positions.length / 9);
    this.cell = cellSize;
    const n = this.triCount;
    this.normals = new Float32Array(n * 3);
    this.stamp = new Int32Array(n);
    this.stampId = 0;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
    }
    if (!n) { minX = minY = minZ = maxX = maxY = maxZ = 0; }
    this.bounds = { minX, minY, minZ, maxX, maxY, maxZ };
    this.nx = Math.max(1, Math.ceil((maxX - minX) / cellSize) + 1);
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / cellSize) + 1);

    const cells = this.nx * this.nz;
    const counts = new Int32Array(cells + 1);
    const range = (t) => {
      const o = t * 9;
      const x0 = Math.min(positions[o], positions[o + 3], positions[o + 6]);
      const x1 = Math.max(positions[o], positions[o + 3], positions[o + 6]);
      const z0 = Math.min(positions[o + 2], positions[o + 5], positions[o + 8]);
      const z1 = Math.max(positions[o + 2], positions[o + 5], positions[o + 8]);
      return [this._cx(x0), this._cx(x1), this._cz(z0), this._cz(z1)];
    };
    for (let t = 0; t < n; t++) {
      const o = t * 9;
      const ux = positions[o + 3] - positions[o], uy = positions[o + 4] - positions[o + 1], uz = positions[o + 5] - positions[o + 2];
      const vx = positions[o + 6] - positions[o], vy = positions[o + 7] - positions[o + 1], vz = positions[o + 8] - positions[o + 2];
      let nxn = uy * vz - uz * vy, nyn = uz * vx - ux * vz, nzn = ux * vy - uy * vx;
      const l = Math.hypot(nxn, nyn, nzn) || 1;
      this.normals[t * 3] = nxn / l; this.normals[t * 3 + 1] = nyn / l; this.normals[t * 3 + 2] = nzn / l;
      const [a, b, c, d] = range(t);
      for (let z = c; z <= d; z++) for (let x = a; x <= b; x++) counts[z * this.nx + x + 1]++;
    }
    for (let i = 0; i < cells; i++) counts[i + 1] += counts[i];
    this.cellStart = counts;
    this.cellItems = new Int32Array(counts[cells]);
    const fill = counts.slice(0, cells);
    for (let t = 0; t < n; t++) {
      const [a, b, c, d] = range(t);
      for (let z = c; z <= d; z++) for (let x = a; x <= b; x++) this.cellItems[fill[z * this.nx + x]++] = t;
    }
    this._near = [];
  }

  // Triangles [start, end) form a gate (e.g. an unlockable barrier); open gates are ignored by every query.
  markGate(start, end) { this._g0 = start; this._g1 = end; this._gateOff = false; }
  setGateOpen(open) { this._gateOff = !!open; }
  get gateOpen() { return !!this._gateOff; }

  _cx(x) { return Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.bounds.minX) / this.cell))); }
  _cz(z) { return Math.max(0, Math.min(this.nz - 1, Math.floor((z - this.bounds.minZ) / this.cell))); }

  // Unique triangle ids whose cells overlap the XZ box.
  _query(x0, z0, x1, z1) {
    const out = this._near;
    out.length = 0;
    const id = ++this.stampId;
    const cx0 = this._cx(x0), cx1 = this._cx(x1), cz0 = this._cz(z0), cz1 = this._cz(z1);
    for (let z = cz0; z <= cz1; z++) {
      for (let x = cx0; x <= cx1; x++) {
        const c = z * this.nx + x;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          const t = this.cellItems[k];
          if (this.stamp[t] !== id) {
            this.stamp[t] = id;
            if (!(this._gateOff && t >= this._g0 && t < this._g1)) out.push(t);
          }
        }
      }
    }
    return out;
  }

  // Highest surface under (x,z) within [fromY - maxDown, fromY]. Returns {y, ny} or null.
  groundAt(x, z, fromY, maxDown) {
    const P = this.pos;
    let best = null;
    for (const t of this._query(x, z, x, z)) {
      const o = t * 9;
      const ax = P[o], az = P[o + 2], bx = P[o + 3], bz = P[o + 5], cx = P[o + 6], cz = P[o + 8];
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * P[o + 1] + l2 * P[o + 4] + l3 * P[o + 7];
      if (y > fromY || y < fromY - maxDown) continue;
      const ny = Math.abs(this.normals[t * 3 + 1]);
      if (!best || y > best.y) best = { y, ny };
    }
    return best;
  }

  // Ray vs. world (double-sided Moller-Trumbore). dir must be unit length.
  // Returns the hit distance along the ray, or null if nothing within maxDist.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const P = this.pos;
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    let best = Infinity;
    for (const t of this._query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez))) {
      const o = t * 9;
      const e1x = P[o + 3] - P[o], e1y = P[o + 4] - P[o + 1], e1z = P[o + 5] - P[o + 2];
      const e2x = P[o + 6] - P[o], e2y = P[o + 7] - P[o + 1], e2z = P[o + 8] - P[o + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det;
      const tx = ox - P[o], ty = oy - P[o + 1], tz = oz - P[o + 2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (d >= 0 && d <= maxDist && d < best) best = d;
    }
    return best === Infinity ? null : best;
  }

  // Pushes a stack of spheres (centres at p.y + offsets[i]) out of geometry.
  // p: {x,y,z} is moved; vel: {vx,vy,vz} loses its into-surface component.
  // Returns {ground, wall} contact flags.
  pushOut(p, vel, offsets, r) {
    const res = { ground: false, wall: false };
    const P = this.pos;
    const q = [0, 0, 0];
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const off of offsets) {
        const cy = p.y + off;
        for (const t of this._query(p.x - r, p.z - r, p.x + r, p.z + r)) {
          const o = t * 9;
          if (P[o + 1] > cy + r && P[o + 4] > cy + r && P[o + 7] > cy + r) continue;
          if (P[o + 1] < cy - r && P[o + 4] < cy - r && P[o + 7] < cy - r) continue;
          closestOnTriangle(p.x, cy, p.z, P, o, q);
          const dx = p.x - q[0], dy = cy - q[1], dz = p.z - q[2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= r * r) continue;
          let nx, ny, nz, depth;
          const d = Math.sqrt(d2);
          if (d > 1e-6) { nx = dx / d; ny = dy / d; nz = dz / d; depth = r - d; }
          else { nx = this.normals[t * 3]; ny = this.normals[t * 3 + 1]; nz = this.normals[t * 3 + 2]; depth = r; }
          p.x += nx * depth; p.y += ny * depth; p.z += nz * depth;
          moved = true;
          if (ny >= WALKABLE_NY) {
            res.ground = true;
            if (vel.vy < 0) vel.vy = 0;
          } else {
            if (ny > -0.3) res.wall = true;
            const dot = vel.vx * nx + vel.vy * ny + vel.vz * nz;
            if (dot < 0) { vel.vx -= nx * dot; vel.vy -= ny * dot; vel.vz -= nz * dot; }
          }
        }
      }
      if (!moved) break;
    }
    return res;
  }
}

// Closest point on triangle (P[o..o+8]) to point (px,py,pz) -> out[0..2] (Ericson).
function closestOnTriangle(px, py, pz, P, o, out) {
  const ax = P[o], ay = P[o + 1], az = P[o + 2];
  const bx = P[o + 3], by = P[o + 4], bz = P[o + 5];
  const cx = P[o + 6], cy = P[o + 7], cz = P[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = ax + abx * v; out[1] = ay + aby * v; out[2] = az + abz * v; return;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = ax + acx * w; out[1] = ay + acy * w; out[2] = az + acz * w; return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out[0] = bx + (cx - bx) * w; out[1] = by + (cy - by) * w; out[2] = bz + (cz - bz) * w; return;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
}

// Collects world-space triangles from a THREE scene (caller supplies THREE-agnostic
// meshes via `meshes`: [{ position: BufferAttribute, index, matrixWorld }]).
export function trianglesFromMeshes(meshes) {
  const out = [];
  for (const { geometry, matrixWorld } of meshes) {
    const pa = geometry.attributes.position;
    const idx = geometry.index;
    const e = matrixWorld.elements;
    const v = (i) => {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      out.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14]
      );
    };
    const n = idx ? idx.count : pa.count;
    for (let i = 0; i + 2 < n; i += 3) {
      if (idx) { v(idx.getX(i)); v(idx.getX(i + 1)); v(idx.getX(i + 2)); }
      else { v(i); v(i + 1); v(i + 2); }
    }
  }
  return new Float32Array(out);
}

// 12 triangles (world space) of an axis-aligned box.
export function boxTriangles(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const out = [];
  for (const [a, b, c2, d] of quads) for (const tri of [[a, b, c2], [a, c2, d]]) for (const i of tri) out.push(...v[i]);
  return new Float32Array(out);
}

// Model triangles plus an optional closed barrier box (gate). Returns a CollisionWorld.
export function gatedWorld(tris, barrier) {
  if (!barrier) return new CollisionWorld(tris);
  const box = boxTriangles(barrier.min, barrier.max);
  const all = new Float32Array(tris.length + box.length);
  all.set(tris);
  all.set(box, tris.length);
  const w = new CollisionWorld(all);
  w.markGate(tris.length / 9, all.length / 9);
  return w;
}
