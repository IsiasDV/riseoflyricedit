// Builds a CollisionWorld on the server by parsing a map's .glb directly
// (no Three.js): accessors + node transforms + the map scale from MAP_DATA.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CollisionWorld, gatedWorld } from '../client/js/game/collision-world.js';
import { MAP_DATA } from '../client/js/maps/map-data.js';
import { buildSpawnPoints } from '../client/js/game/spawn-points.js';

const CLIENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
const COMP = { 5120: [1, Int8Array], 5121: [1, Uint8Array], 5122: [2, Int16Array], 5123: [2, Uint16Array], 5125: [4, Uint32Array], 5126: [4, Float32Array] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const mul = (a, b) => { // column-major 4x4
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1
  ];
}

function readAccessor(json, bin, idx) {
  const acc = json.accessors[idx];
  const bv = json.bufferViews[acc.bufferView];
  const [size, Arr] = COMP[acc.componentType];
  const n = NCOMP[acc.type];
  const stride = bv.byteStride || size * n;
  const base = bin.byteOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(bin.buffer, 0, bin.buffer.byteLength);
  const out = new (acc.componentType === 5126 ? Float32Array : Float64Array)(acc.count * n);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[acc.componentType];
  void Arr;
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < n; k++) {
      let v = dv[get](base + i * stride + k * size, true);
      if (acc.normalized) v /= { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[acc.componentType] || 1;
      out[i * n + k] = v;
    }
  }
  return out;
}

// Parses GLB bytes -> Float32Array of world-space triangles (scaled).
export function trianglesFromGlb(buf, scale = 1, noCollide = []) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(start, start + len).toString('utf8'));
    else if (type === 0x004e4942 && !bin) bin = buf.subarray(start, start + len);
    off = start + len + ((4 - (len % 4)) % 4);
  }
  const out = [];
  const visit = (ni, parent) => {
    const n = json.nodes[ni];
    const m = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined && !noCollide.includes(n.name)) {
      for (const prim of json.meshes[n.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const pos = readAccessor(json, bin, prim.attributes.POSITION);
        const idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices) : null;
        const count = idx ? idx.length : pos.length / 3;
        const push = (i) => {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          out.push(
            (m[0] * x + m[4] * y + m[8] * z + m[12]) * scale,
            (m[1] * x + m[5] * y + m[9] * z + m[13]) * scale,
            (m[2] * x + m[6] * y + m[10] * z + m[14]) * scale
          );
        };
        for (let i = 0; i + 2 < count; i += 3) {
          if (idx) { push(idx[i]); push(idx[i + 1]); push(idx[i + 2]); } else { push(i); push(i + 1); push(i + 2); }
        }
      }
    }
    for (const c of n.children || []) visit(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const scene = json.scenes[json.scene ?? 0];
  for (const r of scene.nodes) visit(r, I);
  return new Float32Array(out);
}

const cache = new Map();
const triCache = new Map();

function modelTriangles(mapId) {
  if (!triCache.has(mapId)) {
    const d = MAP_DATA[mapId];
    triCache.set(mapId, trianglesFromGlb(readFileSync(path.join(CLIENT_DIR, d.model)), d.scale, d.noCollide));
  }
  return triCache.get(mapId);
}

// Returns the map's CollisionWorld, or null if the map has no data/file.
// own: a fresh world (own gate state) for one match; otherwise a shared cached one (gate stays closed).
export function loadMapWorld(mapId, { own = false } = {}) {
  if (!own && cache.has(mapId)) return cache.get(mapId);
  let world = null;
  const d = MAP_DATA[mapId];
  if (d?.model) {
    try {
      world = gatedWorld(modelTriangles(mapId), d.barrier);
    } catch (e) {
      console.warn(`[map-world] could not load ${d.model}: ${e.message}`);
    }
  }
  if (!own) cache.set(mapId, world);
  return world;
}

const spawnCache = new Map();

// Enemy spawn floors for a map (precomputed once, ~0.2 s). stage 'open' = barrier unlocked.
export function loadSpawnPoints(mapId, stage = 'closed') {
  const key = `${mapId}:${stage}`;
  if (spawnCache.has(key)) return spawnCache.get(key);
  const d = MAP_DATA[mapId];
  const open = stage === 'open';
  const world = open ? loadMapWorld(mapId, { own: true }) : loadMapWorld(mapId);
  if (open) world?.setGateOpen?.(true);
  const areas = (open && d?.enemyAreasOpen) || d?.enemyAreas;
  const pts = world && areas ? buildSpawnPoints(world, areas, { start: d.spawn }) : [];
  spawnCache.set(key, pts);
  return pts;
}
