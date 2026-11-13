// Priced map machines (pure; shared by client and server).
import { MAP_DATA } from '../maps/map-data.js';

// Default prices; a map can override with a `cost` on its MAP_DATA entry (see costOf).
export const COSTS = { spin: 500, teleporter: 250, colorMachine: 100, barrier: 500, lyricMachine: 650, tpA: 50, tpB: 50 };
export const REACH = 3.2; // server tolerance (client prompt radius is ~2.2 m)
const REACH_OF = { barrier: 5.5 }; // used from either side of a wall
export const reachOf = (kind) => REACH_OF[kind] ?? REACH;

const FIELD = { spin: 'powerupMachine', teleporter: 'teleporter', colorMachine: 'colorMachine', lyricMachine: 'lyricMachine', barrier: 'barrier', tpA: 'teleporters', tpB: 'teleporters' };

// [x, y, z] of the machine on a map, or null if the map doesn't have it.
export function machinePos(mapId, kind) {
  const e = MAP_DATA[mapId]?.[FIELD[kind]];
  if (!e) return null;
  if (kind === 'barrier') return [(e.min[0] + e.max[0]) / 2, e.min[1], (e.min[2] + e.max[2]) / 2];
  if (kind === 'tpA') return e.a;
  if (kind === 'tpB') return e.b;
  return e.at ?? null;
}

// Price of a machine on a map (map override, else the default).
export function costOf(mapId, kind) {
  const e = MAP_DATA[mapId]?.[FIELD[kind]];
  return e?.cost ?? COSTS[kind];
}

// Linked teleporters: where using pad `kind` sends you (the other pad).
export const linkedDest = (mapId, kind) => machinePos(mapId, kind === 'tpA' ? 'tpB' : 'tpA');

// Teleporter: pay points if you have them, else give up your gun, else it is free.
export const teleportPay = (points, hasGun) => (points >= COSTS.teleporter ? 'points' : hasGun ? 'gun' : 'free');
