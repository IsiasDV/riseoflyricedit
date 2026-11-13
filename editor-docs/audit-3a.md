# Editor Docs: Audit 3a - Placeable Types (Part 1 of 2)

A table of every placeable, spawnable, or interactable type in the game.

## Placeable Type Table (Part 1 of 2)

| # | Name | Creating File and Function | Parameters | Data Source | Editable? |
|---|------|---------------------------|------------|-------------|-----------|
| 1 | Terrain / Map Geometry | client/js/maps/<id>.js createLevel(loaded) | Model from MAP_DATA[<id>].model, scaled by MAP_DATA.scale | MAP_DATA | No (read-only: model, scale, noCollide, ready) |
| 2 | Kill Plane / Fall Boundary | Computed per map: killY = collision.bounds.minY - 30 (game-session.js) | None (derived from collision bounds) | CollisionWorld bounds | No (no visual) |
| 3 | Player Spawn Point | Map definition field spawn (MAP_DATA[<id>].spawn); set in game-session.js | x, y, z feet position + yaw | MAP_DATA.spawn | Yes |
| 4 | Enemy Spawn Floors (Areas) | buildSpawnPoints(world, areas, {start, grid}) (client/js/game/spawn-points.js); server: loadSpawnPoints(mapId, stage) (server/map-world.js) | CollisionWorld, areas [{min,max}], start (player spawn for reachability), grid (default 1m) | MAP_DATA.enemyAreas / enemyAreasOpen | Yes (area box) |
| 5 | Enemies - Beh (Stationary) | EnemySystem.spawn(x, y, z, yaw, kind='beh') (client/js/game/enemies.js); def ENEMY_DEFS.beh | x, y, z, yaw, kind | ENEMY_DEFS.beh in enemy-defs.js | No (hardcoded enemy definition) |
| 6 | Enemies - Meh (Chaser) | Same EnemySystem; def ENEMY_DEFS.meh (kind:'chaser') | x, y, z, yaw | ENEMY_DEFS.meh in enemy-defs.js | No (hardcoded enemy definition) |
| 7 | Gun Pickup | createPickupSpawns(model, positions, style) (client/js/maps/pickup-spawns.js) | model, positions [[x,y,z]...], style, sparkles | MAP_DATA.gunSpawns + server/maps.js GUN_SPAWNS | Yes |
| 8 | Ammo Pickup | Same createPickupSpawns with BLUE_STYLE | model, positions [[x,y,z]...], style, sparkles | MAP_DATA.ammoSpawns + server/maps.js AMMO_SPAWNS | Yes |

---
*End of audit-3a.md (first half)*