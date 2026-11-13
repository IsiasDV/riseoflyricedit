# Editor Docs: Audit 5 - Blockers

Anything that makes loading map data from a JSON file difficult, with file and function names.

## 1. Levels Are JS Modules, Not Data
- Levels are JavaScript modules exporting `createLevel(loaded)` factory. No JSON level format exists.
- To add a map, you create `client/js/maps/<id>.js`, import it in `client/js/maps/maps.js`, and mirror in `server/maps.js`. The engine has no JSON loader for levels.
- An editor would have to emit JS modules in this exact shape, or the engine needs a new data-driven level loader - neither exists.

## 2. Server Imports Client Code Directly
- `server/lobby-manager.js` imports ~14 modules from `../client/js/game/*` (enemies.js, projectiles.js, weapons.js, interactions.js, scoring.js, match-stats.js, rounds.js, powerups.js, perks.js, grandmaster-beh.js, spawn-points.js, sfx.js, enemy-defs.js).
- `server/map-world.js` imports `../client/js/game/collision-world.js`, `map-data.js`, `spawn-points.js`.
- Server depends on client modules. Headless use (server-side tooling) is untested and may fail.

## 3. Duplicated Map Data Must Be Hand-Mirrored
- `GUN_SPAWNS`/`AMMO_SPAWNS` and `enemyAreas` exist in both `client/js/maps/<id>.js` and `server/maps.js`.
- `MAP_DATA` fields (`barrier`, `powerupMachine`, `teleporters`, etc.) are read by both the client map-defs and server `interactions.js` / `map-world.js`.
- Drift between client and server copies silently breaks matches.

## 4. Level Instantiation Coupled to Match Flow
- `createLevel(loaded)` is invoked inside `GameSession._onLoadMsg`/`_onBeginMsg` after `loadAssets(...)` preloads the map's manifest.
- No standalone `loadLevel(mapId)` API exists. Creating a level requires walking countdown -> loading -> assets -> createLevel sequence.
- `pendingLevel`/`level` are single slots in `GameSession`; teardown disposes everything.

## 5. Collision Geometry Must Be Prebuilt from .glb
- `CollisionWorld` is built once from loaded/static meshes (client) or `.glb` bytes (server).
- Dynamic level edits would require rebuilding the uniform grid. No API for incremental collision updates.

## 6. Enemy Spawn Floors Precomputed and Cached
- `loadSpawnPoints` caches per `mapId:stage` (~0.2 s computation).
- `buildSpawnPoints` needs a `CollisionWorld` and a `start` spawn. Spawn data is derived from areas at load time, not authored per point.

## 7. Global / Singleton State
- `GameServer` (module-level), `profile`, `settings`, `GameLoop`, `LobbyManager` singletons.
- `GameSession` holds one active match. Multi-instance editing/previewing not supported.

## 8. No Server-Side Validation
- Player position is client-authoritative (`PLAYER_STATE`). Server `_tickOnce` only echoes snapshots.
- Gameplay simulation runs inside `LobbyManager._simulate` per lobby, not in `GameServer`.
- An editor's "play in editor" would need to replicate which simulation path applies.

## 9. MAP_DATA.ready Gate
- Matches cannot start on maps with `ready: false` (`isReady`/`isMapReady`).
- `endless-shot` and `fearvelations` blocked until assets+values filled and flag removed.

---
*End of audit-5-blockers.md*