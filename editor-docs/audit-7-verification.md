# Audit 7 - Verification vs Source Code

Cross-checked audit claims against real source. No source files changed.

## 1. MAP_DATA SHAPE

Every MAP_DATA entry (client/js/maps/map-data.js): model(string), scale(number), noCollide(string[]), spawn([x,y,z]), enemyAreas(array of {min,max}), enemyAreasOpen(array of {min,max}), teleporter({at,to} singular/Ungaland only), teleporters({a,b,cost} plural/choco only), colorMachine({at}), powerupMachine({at,cost?}), lyricMachine({at,cost?}), barrier({min,max,cost?}), ready(boolean, defaults true).

Teleporter: Ungaland singular {at,to}; Choco plural {a,b,cost}. gunSpawns/ammoSpawns NOT in MAP_DATA (map modules + server/maps.js only). barrier/lyricMachine/enemyAreasOpen: Choco only.

All five maps:

```js
// ungaland (ready: defaults true)
{ model: 'assets/map_ungaland/map/map.glb', scale: 2, noCollide: ['Body'], spawn: [0,5.2,0], enemyAreas: [{min:[-18.8,2.3,3.8],max:[23.2,8.2,30.8]},{min:[-14.8,5.0,-13.4],max:[10.8,14.3,-0.3]}], teleporter: {at:[21.3,-10.0,10.6],to:[0.0,15.1,-2.2]}, colorMachine: {at:[0.2,8.0,-25.4]}, powerupMachine: {at:[-4.1,1.6,19.4]} }
// choco-rocklate-gladiator-arena (ready: defaults true)
{ model: 'assets/map_choco/map/map.glb', scale: 0.35, noCollide: [], spawn: [0,-1.0,0], enemyAreas: [{min:[-18.6,-1.1,-30.4],max:[57.7,10.0,5.5]}], enemyAreasOpen: [{min:[-22.4,-1.1,-28.6],max:[37.7,12.2,130.8]}], barrier: {min:[-2.0,-1.1,22.7],max:[4.6,5.9,24.4],cost:500}, powerupMachine: {at:[50.5,-1.1,4.8],cost:350}, teleporters: {a:[5.8,-1.1,-25.8],b:[26.1,7.7,137.6],cost:50}, colorMachine: {at:[38.3,2.6,116.2]}, lyricMachine: {at:[-10.1,0.8,92.0],cost:650} }
// night-of-the-living-void (ready: defaults true)
{ model: 'assets/map_night/map/map.glb', scale: 0.75, noCollide: [], spawn: [0,0.5,0], powerupMachine: {at:[10.3,0.0,1.5]}, enemyAreas: [{min:[-20.2,-0.7,-30.6],max:[30.0,12.1,43.7]}] }
// endless-shot (ready: false)
{ ready: false, model: 'assets/map_endless/map/map.glb', scale: 1, noCollide: [], spawn: [0,0.5,0], enemyAreas: [] }
// fearvelations (ready: false)
{ ready: false, model: 'assets/map_fearvelations/map/map.glb', scale: 1, noCollide: [], spawn: [0,0.5,0], enemyAreas: [] }
```

## 2. SPAWN DATA LOCATION

| Spawn | Where it lives | Single-source? |
|-------|----------------|----------------|
| gun spawns | Map module (client/js/maps/<id>.js) AND server/maps.js | Duplicated (both) |
| ammo spawns | Map module AND server/maps.js | Duplicated (both) |
| enemy areas | MAP_DATA only | Single-source (MAP_DATA) |

gun/ammo coordinates exist in both places; maps.test.mjs asserts they match. Map file canonical; server/maps.js mirror.

## 3. INTERACTABLES

client/js/game/interactions.js: FIELD maps kinds to MAP_DATA fields (spin->powerupMachine, teleporter->teleporter, colorMachine->colorMachine, lyricMachine->lyricMachine, barrier->barrier, tpA->teleporters, tpB->teleporters). machinePos() reads MAP_DATA[mapId][FIELD[kind]]. costOf() returns e?.cost ?? COSTS[kind]. Defaults: spin:500, teleporter:250, colorMachine:100, barrier:500, lyricMachine:650, tpA:50, tpB:50. client/js/maps/map-props.js createMapProps() reads data.barrier/teleporters/colorMachine/powerupMachine/lyricMachine from MAP_DATA via costOf(). server/lobby-manager.js imports COSTS, costOf, reachOf, machinePos, teleportPay from client/js/game/interactions.js.

## 4. LEVEL CREATION CALL SITE

client/js/game/game-session.js _load(): getMap(mapId) -> asset loading -> map.createLevel(assets) -> this.pendingLevel = level -> _begin(run).

Singleplayer: _onStart({mapId,mode}) -> mode!='multi' -> _runLocal(mapId) -> _load(mapId) -> map.createLevel(assets).

MAP_DATA read timing: Inside createLevel. Ungaland reads teleporter/colorMachine/powerupMachine/spawn inside createLevel; Choco reads D=MAP_DATA[ID] at module top, passes D to createMapProps inside createLevel. Editing MAP_DATA before a fresh run is picked up.

singleplayer blocked by ready:false: Yes - isReady(id) = MAP_DATA[id]?.ready !== false; endless-shot and fearvelations blocked.

## 5. NODE vs BROWSER

Node version: package.json "engines": { "node": ">=18.0.0" }. JSON imports/import attributes: NONE (plain ESM .js only). server/map-world.js imports MAP_DATA (pure data, no Three.js). Verified: node -e "import('./server/map-world.js')" -> ok.

## 6. CONTRADICTIONS RESOLVED

| Audit claim | Actual from source |
|-------------|-------------------|
| 18 placeable types | Confirmed: audit-3a (1-8) + audit-3b (9-18) |
| teleporter singular | Ungaland: singular {at,to}; Choco: plural {a,b,cost} |
| gunSpawns/ammoSpawns in MAP_DATA | NOT in MAP_DATA; map modules + server/maps.js mirror |
| interactables read MAP_DATA with defaults | Confirmed: costOf returns e?.cost ?? COSTS[kind] |
| MAP_DATA read at level creation | Confirmed: inside createLevel |
| singleplayer blocked by ready:false | Confirmed via isReady() |
| map-world.js runs under Node | Confirmed: ok |
| Node >= 18.0.0 | package.json engines |
| JSON imports | None |

## 7. OPEN QUESTIONS

Q1 - Each map module reads MAP_DATA at top level and inside createLevel:
- ungaland.js: top-level const {model,noCollide,scale}=MAP_DATA.ungaland, ready:MAP_DATA.ungaland.ready; inside createLevel: MAP_DATA.ungaland.teleporter/.colorMachine/.powerupMachine.at/.spawn.
- choco-rocklate-gladiator-arena.js: top-level const D=MAP_DATA[ID], const {model,noCollide,scale}=D, ready:D.ready; inside createLevel: createMapProps({data:D,...}) reads barrier/teleporters/machines.
- night-of-the-living-void.js: top-level const {model,noCollide,scale}=MAP_DATA['night-of-the-living-void']; inside createLevel: MAP_DATA['night-of-the-living-void'].powerupMachine.at.
- endless-shot.js: top-level const D=MAP_DATA[ID], const {model,noCollide,scale}=D, ready:D.ready; inside createLevel: createMapProps({data:D,...}) and gatedWorld(...,D.barrier).
- fearvelations.js: same as endless-shot.

Q2 - enemyAreasOpen is an array of {min,max} objects (same shape as enemyAreas), not a plain object. Choco: [{min:[-22.4,-1.1,-28.6],max:[37.7,12.2,130.8]}]. Consumed in server/map-world.js loadSpawnPoints(): const areas = (open && d?.enemyAreasOpen) || d?.enemyAreas; then buildSpawnPoints(world, areas, {start:d.spawn}). buildSpawnPoints (client/js/game/spawn-points.js) iterates for (const a of areas) and destructures const [x0,y0,z0]=a.min, [x1,y1,z1]=a.max.

Q3 - Gun/ammo spawns end-to-end: Map modules define export const GUN_SPAWNS=[[x,y,z],...] and export const AMMO_SPAWNS=[[x,y,z],...]. createLevel passes them to createPickupSpawns(model,GUN_SPAWNS,style), returns gunSpawns:guns.spawns, ammoSpawns:ammo.spawns. server/maps.js defines them as {x,y,z} objects: GUN_SPAWNS['ungaland']=[{x:6.4,y:3.2,z:19.5},...]. server/lobby-manager.js imports GUN_SPAWNS,AMMO_SPAWNS from ./maps.js. maps.test.mjs checks cm.GUN_SPAWNS deep-equals G.ungaland.map((p)=>[p.x,p.y,p.z]).

Moving into MAP_DATA keeps test passing if map modules and server/maps.js derive from MAP_DATA[id].gunSpawns/[id].ammoSpawns. What else changes: map modules read D.gunSpawns/D.ammoSpawns instead of exporting constants; server/maps.js reads from MAP_DATA; server/pickups.js/lobby-manager.js server-side spawn logic derives from MAP_DATA; game-session.js reads this.level?.gunSpawns from createLevel return (unchanged).

