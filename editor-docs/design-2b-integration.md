# Editor Docs: Design 2b - applyOverrides and Gun/Ammo Migration (Decision D2)

## Decision D2 - applyOverrides in map-data.js

At the END of `client/js/maps/map-data.js`, after the `MAP_DATA` object is defined, add:

```js
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
  return m && typeof m.at === 'object' && isVec3(m.at) && (m.cost === undefined || typeof m.cost === 'number');
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
  enemyAreasOpen: (v) => v === undefined || Array.isArray(v) && v.every(isArea),
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

import { OVERRIDES } from './map-overrides.js';
applyOverrides(MAP_DATA, OVERRIDES);
```

- `applyOverrides` mutates entries IN PLACE via `target[field] = value` - never replaces `MAP_DATA[id]`.
- This matters because choco/endless-shot/fearvelations do `const D = MAP_DATA[ID]` at module top and
  pass `D` into `createMapProps`/`gatedWorld` inside `createLevel`; in-place mutation is seen by `D`.
- Only whitelisted editable fields are copied; `model`, `scale`, `noCollide` are never touched (read-only).
- `null` deletes the key (supports removing a teleporter or barrier from a map).
- Type-checking rejects malformed values with a console.warn; invalid fields are skipped, not fatal.
- Because every map module and `server/maps.js` import `map-data.js`, they all see merged data at import
  time. The exported `ready` values and `GUN_SPAWNS`/`AMMO_SPAWNS` constants are correct at import time.
- The server sees saved changes only after a server restart (server reads MAP_DATA at startup).

## Gun/ammo migration (unchanged from prior design)

Add `gunSpawns` and `ammoSpawns` arrays to every MAP_DATA entry in map-data.js. Map modules derive
`GUN_SPAWNS`/`AMMO_SPAWNS` from `MAP_DATA[id].gunSpawns`/`.ammoSpawns`. server/maps.js derives
`{x,y,z}` objects from the arrays. Built-in maps stay identical (contents copied verbatim).
`maps.test.mjs` keeps passing because both client and server derive from MAP_DATA.

## Files changed for D2

- `client/js/maps/map-data.js` - add gunSpawns/ammoSpawns per entry; append applyOverrides + import OVERRIDES at end.
- `client/js/maps/map-overrides.js` - NEW: data-only OVERRIDES module.
- `client/js/maps/ungaland.js`, `choco-rocklate-gladiator-arena.js`, `night-of-the-living-void.js`, `endless-shot.js`, `fearvelations.js` - derive GUN_SPAWNS/AMMO_SPAWNS from MAP_DATA.
- `server/maps.js` - derive GUN_SPAWNS/AMMO_SPAWNS from MAP_DATA arrays.
