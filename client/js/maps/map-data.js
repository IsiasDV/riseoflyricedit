// Map facts shared by the client level builder and the server collision loader.
// ready: false (set on a map entry) hides nothing but blocks starting a match on the map (server + client) until its assets exist.
export const isReady = (id) => MAP_DATA[id]?.ready !== false;

import { OVERRIDES } from './map-overrides.js';

// Apply editor overrides onto MAP_DATA entries in place. Mutates existing
// objects (never replaces MAP_DATA[id]) so map modules holding const D =
// MAP_DATA[ID] see merged values. Only whitelisted editable fields are copied.
const EDITABLE_FIELDS = [
  'spawn', 'enemyAreas', 'enemyAreasOpen', 'gunSpawns', 'ammoSpawns',
  'barrier', 'teleporter', 'teleporters', 'colorMachine', 'powerupMachine',
  'lyricMachine', 'ready'
];

function isVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && isFinite(n));
}

function isArea(a) {
  return a && isVec3(a.min) && isVec3(a.max);
}

function isMachine(m) {
  return m && isVec3(m.at) && (m.cost === undefined || typeof m.cost === 'number');
}

function isBarrier(b) {
  return b && isArea(b) && (b.cost === undefined || typeof b.cost === 'number');
}

function isTeleporter(t) {
  return t && isVec3(t.at) && isVec3(t.to);
}

function isTeleporters(t) {
  return t && isVec3(t.a) && isVec3(t.b) && (t.cost === undefined || typeof t.cost === 'number');
}

const CHECK = {
  spawn: isVec3,
  enemyAreas: (v) => Array.isArray(v) && v.every(isArea),
  enemyAreasOpen: (v) => v === undefined || (Array.isArray(v) && v.every(isArea)),
  gunSpawns: (v) => Array.isArray(v) && v.every(isVec3),
  ammoSpawns: (v) => Array.isArray(v) && v.every(isVec3),
  barrier: isBarrier,
  teleporter: isTeleporter,
  teleporters: isTeleporters,
  colorMachine: isMachine,
  powerupMachine: isMachine,
  lyricMachine: isMachine,
  ready: (v) => typeof v === 'boolean'
};

export function applyOverrides(mapData, overrides) {
  for (const [mapId, entry] of Object.entries(overrides)) {
    if (!mapData[mapId]) continue;
    const target = mapData[mapId];
    for (const field of EDITABLE_FIELDS) {
      if (!(field in entry)) continue;
      const value = entry[field];
      if (value === null) { delete target[field]; continue; }
      if (!CHECK[field](value)) { console.warn(`[map-overrides] invalid ${field} for ${mapId}, skipped`); continue; }
      target[field] = value;
    }
  }
}

export const MAP_DATA = {
  // Ungaland: set up, waiting for its model/art. Fill enemyAreas and flip ready to true to go live.
  'ungaland': {
    model: 'assets/map_ungaland/map/map.glb',
    scale: 2,
    noCollide: ['Body'], // the giant animated Beh (skinned) is visual only
    spawn: [0, 5.2, 0],
    enemyAreas: [
      { min: [-18.8, 2.3, 3.8], max: [23.2, 8.2, 30.8] },
      { min: [-14.8, 5.0, -13.4], max: [10.8, 14.3, -0.3] }
    ],
    // Interactive props (world coords, feet height). Teleporter sends the player to `to`.
    teleporter: { at: [21.3, -10.0, 10.6], to: [0.0, 15.1, -2.2] },
    colorMachine: { at: [0.2, 8.0, -25.4] },
    powerupMachine: { at: [-4.1, 1.6, 19.4] },
    gunSpawns: [[6.4, 3.2, 19.5], [-10.6, 4.8, 31.9], [0.8, 4.0, -7.5]],
    ammoSpawns: [[22.5, 1.6, 5.1], [22.4, 5.2, 12.3], [10.7, 1.6, 32.7], [-11.7, 0.0, 8.6], [-12.9, 4.0, -8.4], [3.6, 6.4, -16.5]]
  },
  // Choco-rocklate Gladiator Arena: scaffolded, waiting for assets. Fill values, add machines if wanted, remove ready:false.
  'choco-rocklate-gladiator-arena': {
    model: 'assets/map_choco/map/map.glb',
    scale: 0.35,
    noCollide: [],
    spawn: [0, -1.0, 0], // floor at the origin is y = -1.06 at scale 0.35
    // Enemy spawn boxes: before the barrier is unlocked, then (replacing them) after.
    enemyAreas: [{ min: [-18.6, -1.1, -30.4], max: [57.7, 10.0, 5.5] }],
    enemyAreasOpen: [{ min: [-22.4, -1.1, -28.6], max: [37.7, 12.2, 130.8] }],
    barrier: { min: [-2.0, -1.1, 22.7], max: [4.6, 5.9, 24.4], cost: 500 }, // solid until a player pays
    powerupMachine: { at: [50.5, -1.1, 4.8], cost: 350 },
    teleporters: { a: [5.8, -1.1, -25.8], b: [26.1, 7.7, 137.6], cost: 50 }, // linked at B (free), then 50 pts per trip
    colorMachine: { at: [38.3, 2.6, 116.2] },
    lyricMachine: { at: [-10.1, 0.8, 92.0], cost: 650 }, // spawns a Rise of Lyric orb
    gunSpawns: [[23.5, -1.1, -2.2], [-15.5, -1.1, -31.0], [59.9, -1.1, -15.1], [-17.6, -1.1, 40.6], [-10.2, -0.3, 77.3], [40.1, 1.1, 95.5], [32.2, 8.5, 127.4]],
    ammoSpawns: [[15.8, 8.0, 120.2], [18.5, 0.1, 82.1], [2.1, -1.1, 54.1], [-18.7, 0.2, 83.7], [-33.7, -1.1, 31.9], [-10.2, -1.1, 4.4], [32.9, -1.1, -25.1]]
  },
  // Endless Shot: scaffolded, waiting for assets. Fill values, add machines if wanted, remove ready:false.
  'endless-shot': {
    ready: false,
    model: 'assets/map_endless/map/map.glb',
    scale: 1,
    noCollide: [],
    spawn: [0, 0.5, 0],
    enemyAreas: [],
    gunSpawns: [],
    ammoSpawns: []
    // enemyAreasOpen: [{ min: [x, y, z], max: [x, y, z] }],  // used after the barrier unlocks
    // barrier: { min: [x, y, z], max: [x, y, z], cost: 500 },
    // powerupMachine: { at: [x, y, z], cost: 500 },
    // teleporters: { a: [x, y, z], b: [x, y, z], cost: 50 },
    // colorMachine: { at: [x, y, z] },
    // lyricMachine: { at: [x, y, z], cost: 650 }
  },
  // Fearvelations: scaffolded, waiting for assets. Fill values, add machines if wanted, remove ready:false.
  'fearvelations': {
    ready: false,
    model: 'assets/map_fearvelations/map/map.glb',
    scale: 1,
    noCollide: [],
    spawn: [0, 0.5, 0],
    enemyAreas: [],
    gunSpawns: [],
    ammoSpawns: []
    // enemyAreasOpen: [{ min: [x, y, z], max: [x, y, z] }],  // used after the barrier unlocks
    // barrier: { min: [x, y, z], max: [x, y, z], cost: 500 },
    // powerupMachine: { at: [x, y, z], cost: 500 },
    // teleporters: { a: [x, y, z], b: [x, y, z], cost: 50 },
    // colorMachine: { at: [x, y, z] },
    // lyricMachine: { at: [x, y, z], cost: 650 }
  },
  'night-of-the-living-void': {
    model: 'assets/map_night/map/map.glb',
    scale: 0.75,
    noCollide: [],
    spawn: [0, 0.5, 0],
    powerupMachine: { at: [10.3, 0.0, 1.5] },
    // Enemy spawn boxes (min / max corners); floors inside them are used.
    enemyAreas: [{ min: [-20.2, -0.7, -30.6], max: [30.0, 12.1, 43.7] }],
    gunSpawns: [[9.4, 0.0, 16.7], [5.7, 0.0, -25.1], [-3.9, 5.1, 25.7]],
    ammoSpawns: [[8.3, 5.1, -16.5], [1.5, 5.1, 17.0], [22.0, 0.0, 29.4], [-9.4, 0.0, -16.4], [-18.7, 1.6, 42.3]]
  }
};

// Apply editor overrides onto MAP_DATA (mutates in place, runs before any
// map module imports MAP_DATA so merged values are seen at import time).
applyOverrides(MAP_DATA, OVERRIDES);

